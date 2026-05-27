# pi-mcp-deferred

A deferred context engine for [Pi](https://github.com/earendil-works/pi-coding-agent) MCP integration. Fork of [@spences10/pi-mcp](https://github.com/spences10/my-pi/tree/main/packages/pi-mcp) v0.0.37.

## Problem

Every MCP server you connect loads ALL tool schemas into the LLM context upfront. With 9 MCP servers and ~140 tools, that's 50K+ tokens of unused schemas every single turn. Factory's telemetry shows 94.6% of sessions never use MCP tools at all.

This causes:

- **Attention dilution** — relevant content competes with unused schemas
- **Tool-selection noise** — similar tool names increase wrong selection rate
- **Earlier compression** — static context fills the window faster

## Solution

Three-phase deferred context engine (inspired by [Factory's Deferred Context Engine](https://factory.ai/blog/the-deferred-context-engine)):

### Phase 1: Discover (startup)

Register **compact stubs** instead of full schemas. Each stub contains:

- Tool name and first-sentence description
- Property names, types, and required arrays (no descriptions/defaults/examples)
- Nested object properties one level deep
- Enum values (if <= 20 items)

This saves ~60-80% tokens vs full schemas while keeping enough structure for the LLM to generate valid function calls.

### Phase 2: Promote (on first use)

When any tool from a server is called for the first time:

1. Auto-promote ALL tools from that server (fetch full schemas from MCP server)
2. Re-register with full descriptions, parameter schemas, defaults, examples
3. Execute the original call immediately — no retry needed

The model sees the full schemas on the next turn.

### Phase 3: Reuse (session lifetime)

Promoted tools stay loaded with full schemas for the rest of the session. No re-defer.

## Installation

Add to your Pi settings (`~/.pi/agent/settings.json`):

```json
{
  "packages": [
    "git:github.com/drvova/pi-mcp-deferred"
  ]
}
```

Remove any existing `npm:@spences10/pi-mcp` entry — this is a drop-in replacement.

## Configuration

### Deferred mode (ON by default)

All MCP servers use deferred mode by default. No configuration needed.

**Disable globally** — set env var:

```bash
export MY_PI_MCP_DEFERRED=0
```

**Disable per-server** — add `"deferred": false` to your MCP config (`~/.pi/agent/mcp.json`):

```json
{
  "my-important-server": {
    "command": "npx",
    "args": ["-y", "some-mcp-server"],
    "deferred": false
  }
}
```

### Eager connect (original behavior)

To connect all MCP servers immediately at startup (original pi-mcp behavior):

```bash
export MY_PI_MCP_EAGER_CONNECT=1
```

### Idle timeout

Disconnect idle MCP servers after N milliseconds (default: 1800000 / 30 minutes):

```json
{
  "my-server": {
    "command": "npx",
    "args": ["-y", "some-mcp-server"],
    "idle_timeout_ms": 600000
  }
}
```

## Tools

### `mcp__expand`

Explicitly load full schemas from an MCP server without calling a tool first.

```
mcp__expand({ server: "exa" })        // promote one server
mcp__expand({ server: "all" })        // promote all connected servers
```

### `/mcp` command

Manage MCP servers interactively:

```
/mcp                  // open management modal
/mcp list             // show all servers and status
/mcp connect <name>   // connect a specific server
/mcp enable <name>    // enable a disabled server
/mcp disable <name>   // disable a connected server
/mcp backup           // backup MCP config
/mcp restore          // restore MCP config
/mcp profile list     // list MCP profiles
```

## How it works

```
Startup:
  mcp.json → connect servers → listTools() → register COMPACT STUBS
  (~60-80% smaller than full schemas)

First tool call from server "exa":
  mcp__exa__web_search_exa({query: "..."})
    → promote_server_tools("exa")
      → listTools() → re-register ALL exa tools with FULL schemas
    → execute tool with passed params (no retry)

Next turn:
  Model sees full schemas for all exa tools

Explicit promotion:
  mcp__expand({server: "exa"}) → full schemas loaded
  mcp__expand({server: "all"}) → all servers promoted
```

## Token savings

| Scenario | Tools | Stub tokens | Full tokens | Savings |
|----------|-------|-------------|-------------|---------|
| 5 MCP servers, 30 tools | 30 | ~3K | ~15K | ~80% |
| 9 MCP servers, 140 tools | 140 | ~15K | ~50K | ~70% |
| 20 MCP servers, 300+ tools | 300+ | ~30K | ~120K | ~75% |

Actual savings depend on tool schema complexity. Tools with many nested properties, long descriptions, and large enums save the most.

## Compatibility

- Drop-in replacement for `@spences10/pi-mcp` v0.0.37
- Same `/mcp` command, same MCP config format, same trust model
- All original features preserved (stdio/HTTP transports, profiles, backup/restore, idle timeout, project configs)
- Pi CLI >= 0.76.0

## Credits

- Original extension: [@spences10/pi-mcp](https://github.com/spences10/my-pi/tree/main/packages/pi-mcp) by Scott Spence
- Deferred context engine concept: [Factory](https://factory.ai/blog/the-deferred-context-engine)
- Compact schema compression: [mcp-context-proxy](https://github.com/kira-autonoma/mcp-context-proxy)

## License

MIT
