/**
 * Starts MDEdit's MCP server over stdio. An MCP client (Claude Desktop, Claude Code, Codex, ...) launches this as a
 * subprocess:   node mdedit-mcp.js [--root <folder>] [--agent <name>]
 * Nothing but protocol messages may go to stdout; diagnostics go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { nodeFs } from '../electron/nodeFs';
import { createServer } from './server';
import { resolveRoot } from './root';

function flag(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : args[i + 1];
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    process.stderr.write('MDEdit MCP server\n  --root <folder>   the folder that holds your projects (default: the Root Folder set in MDEdit)\n  --agent <name>    how the AI is named in the Notes panel (default: taken from the client)\n');
    return;
  }
  const { root, source } = await resolveRoot({ flag: flag('root'), fs: nodeFs });
  const st = await nodeFs.stat(root);
  if (!st?.isDirectory) throw new Error(`The projects folder "${root}" (from ${source}) does not exist. Pass --root <folder>.`);
  const server = createServer({ fs: nodeFs, root, agent: flag('agent'), version: process.env.MDEDIT_VERSION });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`MDEdit MCP server ready. Projects folder: ${root} (${source})\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
