# paperlantern

Research intelligence that makes your AI coding agent smarter - one command setup.

[Paper Lantern](https://paperlantern.ai) gives your AI coding agent access to 2M+ CS research papers - the right technique for your problem, with tradeoffs, benchmarks, and implementation guidance.

## Quick start

```
npx paperlantern@latest
```

That's it. Pick your agents, log in, and Paper Lantern is configured.

### Claude Code (manual)

```
claude mcp add --transport http -s user paper-lantern https://mcp.paperlantern.ai/chat/mcp?key=YOUR_KEY
```

This adds the MCP server but does not install agent rules. Use `npx paperlantern@latest` for the full setup.

## Supported agents

- Claude Code
- Cursor
- Windsurf
- GitHub Copilot (VS Code)
- Codex
- Gemini CLI

## What it does

The setup CLI:

1. Authenticates via OAuth (opens browser)
2. Configures the MCP server for your selected agents
3. Installs agent rules so your agent knows when to use Paper Lantern

## Tools available

Once configured, your agent gets these tools:

| Tool | What it does |
|------|-------------|
| `explore_approaches` | Survey 4-6 approach families with evidence and tradeoffs |
| `deep_dive` | Investigate one technique in depth - implementation, hyperparameters, failure modes |
| `compare_approaches` | Side-by-side comparison of 2-3 candidates |
| `check_feasibility` | GO / PROTOTYPE / RECONSIDER verdict given your constraints |
| `give_feedback` | Tell us what helped and what didn't |

## When your agent uses Paper Lantern

Paper Lantern activates when your agent is making technical decisions where research evidence could improve the outcome - choosing between algorithms, architectures, or techniques.

It does **not** activate for syntax questions, library lookups, debugging, or general programming tasks.

## Links

- [Website](https://paperlantern.ai)
- [Setup guide](https://paperlantern.ai/docs/setup)
