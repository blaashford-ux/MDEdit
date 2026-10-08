# AI reviewers (MCP)

MDEdit ships an MCP server so Claude, GPT and any other MCP client can read your chapters and leave **comments and suggestions** in the Notes panel, like a human reviewer. It cannot change your manuscript: you accept or reject each note in MDEdit. Design and plan: [milestone-9-ai-review-plan.md](milestone-9-ai-review-plan.md).

## Connect
In MDEdit, open a project, choose **Notes → AI…**. It shows settings ready to copy for Claude Code, Claude Desktop and Codex (GPT), and lists the notes each AI has left, with a button to delete all of one reviewer's notes. In the installed app the server runs on MDEdit itself, so Node.js isn't needed. New notes appear in the Notes panel within a few seconds.

Running from source instead:
```
npm ci
npm run build:electron      # writes dist-electron/mcp/mdedit-mcp.js (one self-contained file; needs Node 20+ to run)
```

It finds your projects by itself: `--root <folder>`, then the `MDEDIT_ROOT` variable, then the Root Folder set in MDEdit, then `~/MDEdit`. `--agent <name>` overrides how the AI is named in the Notes panel (normally taken from the client: "Claude", "GPT").

## Connect a client by hand
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

## Who a note is signed as
The AI is named from the client ("Claude", "GPT"). `add_notes` and `reply_to_note` take an optional **`skill`**: a skill that passes `"Line edit"` signs its notes **Claude · Line edit**; with no skill the notes are signed just **Claude**. Any label works (`"Dialogue Voice"` gives **Claude · Dialogue Voice**), and `line`, `line-editing` and `Line edit` all mean the same skill. Each signature is its own file, so filtering and deleting work per skill.

## In the Notes panel
Notes from an AI carry an **AI** badge and a topic chip (the `category`). When there is more than one reviewer or topic, two filters appear. With one reviewer selected, **Accept all N suggestions** applies that reviewer's open suggestions to the chapter after a confirmation.

## Where notes go
Each AI and skill gets its own file, `<project>/.mdedit/review/ai-<ai>[-<skill>].json` (`ai-claude.json`, `ai-claude-line.json`). Deleting that file removes everything that reviewer wrote. These files stay on the PC they were written on; project sync does not copy `.mdedit/review`.
