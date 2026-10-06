/**
 * Keeps one device in step with Drive: remembers whether Google Drive is connected, runs sync passes one at a time,
 * debounces a pass after local edits, and reports a simple status for the UI. Platform-neutral: the phone and the
 * PC each supply their own sign-in (`authorize`) and file system.
 */
import type { SyncApi, SyncStatus, SyncSummary } from '../api';
import { makeFiles } from '../backend/files';
import type { FsPort } from '../fsPort';
import type { DriveApi } from './drive';
import { createDriveRest } from './driveRest';
import { emptySyncState, sanitizeSyncState, syncOnce, type StateStore, type SyncReport, type SyncState } from './engine';

export interface SyncServiceOptions {
  fs: FsPort;
  /** The local Root Folder. */
  root: string;
  /** Where this service keeps its memory (outside the Root, so it never syncs). */
  stateFile: string;
  /** An access token for Drive's `drive.file` scope. The first call may show Google's sign-in and consent screens. */
  authorize(): Promise<string>;
  /** Short device name for conflict copies. */
  device: string;
  trashLocal?(path: string): Promise<void>;
  now?: () => Date;
  /** Called after a pass that changed local files, so the UI can refresh. */
  onLocalChanges?(report: SyncReport): void;
  /** Forgets the Google sign-in (token) when the user disconnects. */
  signOut?(): Promise<void>;
  /** For tests: a stand-in Drive. */
  makeDrive?(getToken: (force?: boolean) => Promise<string>): DriveApi;
}

interface Saved {
  connected: boolean;
  lastSyncAt: number | null;
  /** The Root Folder this memory is about: if it moves, the memory is dropped and everything is re-checked. */
  root: string;
  state: SyncState;
}

const TOKEN_LIFETIME_MS = 45 * 60_000;

const summarise = (r: SyncReport): SyncSummary => ({
  uploaded: r.uploaded.length + r.merged.length,
  downloaded: r.downloaded.length,
  deleted: r.deletedLocal.length + r.deletedRemote.length,
  conflicts: r.conflicts,
  skipped: r.skipped,
  errors: r.errors,
  rootCreated: r.rootCreated,
});

const friendly = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|network|offline|load failed/i.test(msg)) return 'Can’t reach Google Drive. Check your connection; this will retry.';
  return msg;
}

export class SyncService implements SyncApi {
  private saved: Saved;
  private status: SyncStatus = { connected: false, state: 'off', lastSyncAt: null, message: null, summary: null, pendingDeletes: [], localChanges: 0 };
  /** Edits are waiting for a pass (set by `syncSoon`, cleared when a pass starts). */
  dirty = false;
  private listeners = new Set<(s: SyncStatus) => void>();
  private running: Promise<SyncStatus> | null = null;
  private rerun = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private token: { value: string; at: number } | null = null;
  private readonly files;
  private readonly store: StateStore;

  constructor(private readonly o: SyncServiceOptions) {
    this.files = makeFiles(o.fs);
    this.saved = { connected: false, lastSyncAt: null, root: o.root, state: emptySyncState() };
    this.store = {
      load: async () => this.saved.state,
      save: async (s) => {
        this.saved.state = s;
        await this.persist();
      },
    };
  }

  /** Reads what was saved by an earlier run (connection, last sync, sync memory). */
  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await this.o.fs.readText(this.o.stateFile)) as Partial<Saved>;
      const sameRoot = raw.root === undefined || raw.root === this.o.root; // older files have no root: trust them
      this.saved = {
        connected: raw.connected === true,
        lastSyncAt: typeof raw.lastSyncAt === 'number' ? raw.lastSyncAt : null,
        root: this.o.root,
        state: sameRoot ? sanitizeSyncState(raw.state) : emptySyncState(), // a different folder: start fresh, never treat it as "everything was deleted"
      };
    } catch {
      this.saved = { connected: false, lastSyncAt: null, root: this.o.root, state: emptySyncState() };
    }
    this.set({ connected: this.saved.connected, state: this.saved.connected ? 'idle' : 'off', lastSyncAt: this.saved.lastSyncAt });
  }

  private async persist(): Promise<void> {
    await this.files.writeFileAtomic(this.o.stateFile, JSON.stringify(this.saved));
  }

  private set(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  getSyncStatus = async () => this.status;

  onSyncStatus = (cb: (s: SyncStatus) => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  };

  private getToken = async (force = false): Promise<string> => {
    if (!force && this.token && Date.now() - this.token.at < TOKEN_LIFETIME_MS) return this.token.value;
    const value = await this.o.authorize();
    this.token = { value, at: Date.now() };
    return value;
  };

  async connectSync(): Promise<SyncStatus> {
    try {
      await this.getToken(true); // shows Google's sign-in and consent the first time
    } catch (e) {
      this.set({ state: 'error', message: friendly(e) });
      return this.status;
    }
    this.saved.connected = true;
    await this.persist();
    this.set({ connected: true, state: 'idle', message: null });
    return this.syncNow();
  }

  async disconnectSync(): Promise<void> {
    this.stop();
    this.token = null;
    this.saved = { connected: false, lastSyncAt: null, root: this.o.root, state: emptySyncState() }; // forget the base state: a different account must start fresh
    await this.persist();
    await this.o.signOut?.().catch(() => undefined);
    this.set({ connected: false, state: 'off', lastSyncAt: null, message: null, summary: null, pendingDeletes: [] });
  }

  syncNow(): Promise<SyncStatus> {
    return this.pass(false);
  }

  confirmDeletes(): Promise<SyncStatus> {
    return this.pass(true);
  }

  private pass(allowDeletes: boolean): Promise<SyncStatus> {
    if (!this.saved.connected) return Promise.resolve(this.status);
    if (this.running) {
      this.rerun = true; // something changed while syncing: go round again afterwards
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rerun = false;
          this.dirty = false;
          this.set({ state: 'syncing', message: null });
          const drive = this.o.makeDrive ? this.o.makeDrive(this.getToken) : createDriveRest({ getToken: this.getToken });
          const report = await syncOnce({
            fs: this.o.fs, root: this.o.root, drive, store: this.store, device: this.o.device, now: this.o.now,
            trashLocal: this.o.trashLocal, allowDeletes: allowDeletes && !this.rerun,
          });
          this.saved.lastSyncAt = Date.now();
          await this.persist();
          const confirm = report.pendingDeletes.length > 0;
          this.set({
            state: confirm ? 'confirm' : report.errors.length > 0 ? 'error' : 'idle',
            lastSyncAt: this.saved.lastSyncAt, summary: summarise(report), pendingDeletes: report.pendingDeletes,
            message: confirm ? `This would delete ${report.pendingDeletes.length} files. Check it’s what you meant.` : report.errors.length > 0 ? `${report.errors.length} file${report.errors.length === 1 ? '' : 's'} couldn’t sync; they will be retried.` : null,
          });
          if (report.changedLocal) {
            this.set({ localChanges: this.status.localChanges + 1 });
            this.o.onLocalChanges?.(report);
          }
          allowDeletes = false;
        } while (this.rerun);
      } catch (e) {
        this.set({ state: 'error', message: friendly(e) });
      } finally {
        this.running = null;
      }
      return this.status;
    })();
    return this.running;
  }

  /** Runs a pass shortly from now (and coalesces repeated calls): use after the user edits a file. */
  syncSoon(delayMs = 5000): void {
    if (!this.saved.connected) return;
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delayMs);
  }

  /** Runs a pass every `everyMs` while `shouldRun()` says so (for example, while the app is in front). */
  startPolling(everyMs: number, shouldRun: () => boolean = () => true): void {
    this.stop();
    this.poll = setInterval(() => {
      if (shouldRun()) void this.syncNow();
    }, everyMs);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.poll) clearInterval(this.poll);
    this.timer = this.poll = null;
  }
}
