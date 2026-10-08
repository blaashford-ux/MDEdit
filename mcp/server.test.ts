import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFs } from '../src/shared/memoryFs';
import { agentFromClient, createServer } from './server';
import { resolveRoot, settingsCandidates } from './root';

const BOOK = '# One\n\nShe walked slowly to the door.\n\n# Two\n\nThe river ran cold.\n';
let fs: MemoryFs;

beforeEach(() => {
  fs = new MemoryFs();
  fs.seed('/books/Novel/.mdedit/project.json', '{"status":"editing"}');
  fs.seed('/books/Novel/Book.md', BOOK);
});

async function connect(clientName: string, agent?: string) {
  const server = createServer({ fs, root: '/books', agent });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: clientName, version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { isError: !!r.isError, text: r.content[0].text, json: () => JSON.parse(r.content[0].text) };
  };
  return { client, call };
}

describe('the MDEdit MCP server', () => {
  it('offers the tools, with read-only ones marked', async () => {
    const { client } = await connect('claude-ai');
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['add_notes', 'get_notes', 'list_chapters', 'list_files', 'list_projects', 'read_chapter', 'reply_to_note', 'withdraw_note']);
    expect(tools.find((t) => t.name === 'read_chapter')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'add_notes')?.annotations?.readOnlyHint).toBe(false);
  });

  it('reads a chapter and adds a note, signed with the connecting AI’s name', async () => {
    const { call } = await connect('claude-ai');
    expect((await call('list_projects')).json()).toEqual([{ project: 'Novel', status: 'editing' }]);
    expect((await call('read_chapter', { project: 'Novel', file: 'Book.md', chapter: 1 })).json().text).toBe('Two\nThe river ran cold.');
    const added = await call('add_notes', { project: 'Novel', pass: 'line', notes: [{ file: 'Book.md', kind: 'suggestion', quote: 'river ran cold', replacement: 'river ran icy', category: 'word choice' }] });
    expect(added.json()[0]).toMatchObject({ ok: true, chapter: 1 });
    const notes = (await call('get_notes', { project: 'Novel' })).json();
    expect(notes).toMatchObject([{ kind: 'suggestion', reviewer: 'Claude · Line edit', replacement: 'river ran icy' }]);
    expect(await fs.readText('/books/Novel/Book.md')).toBe(BOOK);
  });

  it('GPT clients get the same tools and are named GPT', async () => {
    const { call } = await connect('openai-mcp');
    await call('add_notes', { project: 'Novel', pass: 'copy', notes: [{ file: 'Book.md', kind: 'comment', quote: 'slowly', body: 'Adverb.' }] });
    expect((await call('get_notes', { project: 'Novel' })).json()[0].reviewer).toBe('GPT · Copy edit');
  });

  it('turns mistakes into messages the model can act on, not crashes', async () => {
    const { call } = await connect('x');
    const bad = await call('read_chapter', { project: 'Nope', file: 'Book.md', chapter: 0 });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/list_projects/);
    const res = (await call('add_notes', { project: 'Novel', pass: 'line', notes: [{ file: 'Book.md', kind: 'comment', quote: 'absent', body: 'x' }] })).json();
    expect(res[0]).toMatchObject({ ok: false });
  });

  it('names the AI from the client, or the --agent flag', () => {
    expect(agentFromClient('Claude Desktop')).toEqual({ agent: 'claude', agentName: 'Claude' });
    expect(agentFromClient('codex-cli')).toEqual({ agent: 'gpt', agentName: 'GPT' });
    expect(agentFromClient('mystery')).toEqual({ agent: 'ai', agentName: 'AI' });
    expect(agentFromClient('claude', 'Gemini')).toEqual({ agent: 'Gemini', agentName: 'Gemini' });
  });
});

describe('finding the projects folder', () => {
  it('prefers --root, then MDEDIT_ROOT, then MDEdit’s own setting, then the default', async () => {
    const f = new MemoryFs();
    const home = '/home/me';
    const [first] = settingsCandidates({}, 'linux', home);
    f.seed(first, JSON.stringify({ projects: { rootFolder: '/data/books' } }));
    expect((await resolveRoot({ flag: '/x', env: {}, platform: 'linux', home, fs: f })).source).toBe('--root');
    expect((await resolveRoot({ env: { MDEDIT_ROOT: '/y' }, platform: 'linux', home, fs: f })).source).toBe('MDEDIT_ROOT');
    expect(await resolveRoot({ env: {}, platform: 'linux', home, fs: f })).toMatchObject({ root: '/data/books' });
    expect((await resolveRoot({ env: {}, platform: 'linux', home, fs: new MemoryFs() })).source).toBe('default');
    expect(settingsCandidates({ APPDATA: 'C:\\U\\AppData\\Roaming' }, 'win32', 'C:\\U')[0]).toMatch(/MDEdit[\\/]settings\.json$/);
  });
});
