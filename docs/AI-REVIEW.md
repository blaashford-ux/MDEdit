# AI reviewers (MCP)

MDEdit ships an MCP server so Claude, GPT and any other MCP client can read your chapters and leave **comments and suggestions** in the Notes panel, like a human reviewer. It cannot change your manuscript: you accept or reject each note in MDEdit. Design and plan: [milestone-9-ai-review-plan.md](milestone-9-ai-review-plan.md).

## Get the server
```
npm ci
npm run build:electron      # writes dist-electron/mcp/mdedit-mcp.js (one self-contained file; needs Node 20+ to run)
```

It finds your projects by itself: `--root <folder>`, then the `MDEDIT_ROOT` variable, then the Root Folder set in MDEdit, then `~/MDEdit`. `--agent <name>` overrides how the AI is named in the Notes panel (normally taken from the client: "Claude", "GPT").

## Connect a client
Use the full path to `mdedit-mcp.js` below.

| Client | How |
|---|---|
| Claude Code | `claude mcp add mdedit -- node /path/to/mdedit-mcp.js` |
| Claude Desktop | In `claude_desktop_config.json`: `{ "mcpServers": { "mdedit": { "command": "node", "args": ["C:\\path\\to\\mdedit-mcp.js"] } } }` |
| Codex CLI | In `~/.codex/config.toml`: `[mcp_servers.mdedit]`, `command = "node"`, `args = ["/path/to/mdedit-mcp.js"]` |
| OpenAI Agents SDK | `MCPServerStdio(params={"command": "node", "args": ["/path/to/mdedit-mcp.js"]})` |

The ChatGPT app and claude.ai on the web can only reach servers on the internet, not a program on your PC; that needs the HTTP option planned for phase 5.

## Tools
`list_projects`, `list_files`, `list_chapters`, `read_chapter`, `get_notes`, `add_notes` (up to 50 at a time), `reply_to_note`, `withdraw_note`.

Quotes in `add_notes` are matched against the plain text `read_chapter` returns (Markdown marks removed, one paragraph per line), which is the same text MDEdit anchors notes to. A quote that is missing, or that matches more than one place, is rejected with the reason so the model can fix it. Suggestions must stay inside one paragraph.

## Where notes go
Each AI and editing pass gets its own file, `<project>/.mdedit/review/ai-<ai>-<pass>.json` (`ai-claude-line.json`), shown as "Claude · Line edit". Deleting that file removes everything that reviewer wrote. These files stay on the PC they were written on; project sync does not copy `.mdedit/review`.
