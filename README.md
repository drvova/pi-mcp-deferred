# pi-mcp-deferred

<p align="center">
  <img src="pi-logo-animated.svg" width="360" height="340" alt="Pi MCP Deferred — animated Tetris-style logo">
</p>

A deferred context engine for [Pi](https://github.com/earendil-works/pi) MCP integration. Fork of [@spences10/pi-mcp](https://github.com/spences10/my-pi/tree/main/packages/pi-mcp) v0.0.37.

## Problem

Every MCP server you connect loads ALL tool schemas into the LLM context upfront. With 9 MCP servers and ~140 tools, that's 50K+ tokens of unused schemas every single turn. Factory's telemetry shows 94.6% of sessions never use MCP tools at all.

This causes:

- **Attention dilution** — relevant content competes with unused schemas
- **Tool-selection noise** — similar tool names increase wrong selection rate
- **Earlier compression** — static context fills the window faster

## Solution

Four-phase deferred context engine (inspired by [Factory's Deferred Context Engine](https://factory.ai/news/deferred-context-engine)):

### Phase 0: Catalog (startup, ON by default)

Servers register **no per-tool stubs** at all, and **no MCP server is spawned at
startup**. Each server contributes one line to the `mcp__expand` tool — name, tool
count, and a few sample tool names (~30 tokens/server), read from a **disk cache**
(`~/.pi/agent/mcp-catalog-cache.json`). The model sees which servers exist and what
they do, and calls `mcp__expand({ server })` to load a server's tools (Phase 1)
before using them. A server's process starts only when one of its tools is actually
used — so sessions (including subagent child sessions that inherit this extension)
never spawn a process pool they don't use.

Measured idle cost: **~488 tokens** for the whole `mcp__expand` catalog (20 servers)
vs ~24K for all-native stubs — **~98% off**. Tradeoff: one `expand` round-trip the
first time a server is used in a session (and, on a cold cache, one connect to index
it — cached thereafter). Pin hot servers to skip it (see below).

### Phase 1: Discover (on expand)

Register **compact stubs** instead of full schemas. Each stub contains:

- Tool name and first-sentence description
- Property names, types, and required arrays (no descriptions/defaults/examples)
- Nested object properties one level deep
- Enum values (bounded by serialized size, ~150 tokens)

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

### Catalog mode (ON by default)

Every server starts catalogued — listed in `mcp__expand`, no stubs registered — for
~98% idle token savings. The model calls `mcp__expand({ server })` to load a server
before first use.

**Pin a hot server native** (always-loaded stubs, no expand step) — add `"catalog": false`:

```json
{
  "my-hot-server": {
    "command": "npx",
    "args": ["-y", "some-mcp-server"],
    "catalog": false
  }
}
```

**Disable catalog globally** (back to all-native stubs) — set env var:

```bash
export MY_PI_MCP_CATALOG=0
```

### Deferred mode (ON by default)

Once a server is loaded, its tools register as **compact stubs**; full schemas load
on first call. No configuration needed.

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

For stdio servers, `cwd` sets the working directory for the child process.

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

### HTTP servers & authentication

HTTP / streamable-HTTP MCP servers authenticate one of two ways: a static
request `headers` token (below), or the interactive OAuth 2.0 flow (further
down). For a static token, paste it from your provider as a bearer header:

```json
{
  "linear": {
    "type": "http",
    "url": "https://mcp.linear.app/mcp",
    "headers": {
      "Authorization": "Bearer <your-access-token>"
    }
  }
}
```

The `headers` object is sent verbatim on every request, so any scheme works
(`Authorization: Bearer`, `X-API-Key`, etc.).

### OAuth 2.0 (interactive)

For servers that require OAuth, set `"oauth": true` instead of a static header.
On connect (or on a `401`), Pi runs the OAuth 2.0 authorization-code + PKCE flow:
it discovers the endpoints, dynamically registers a client, opens your browser
to approve, captures the redirect on a loopback callback, and stores the access
and refresh tokens in `~/.pi/agent/oauth-tokens.json` (mode `600`). Tokens are
refreshed automatically; you only approve once. Running `/mcp login <name>`
again replaces the stored credentials and reconnects an active client without
requiring an extension reload.

```json
{
  "linear": {
    "type": "http",
    "url": "https://mcp.linear.app/mcp",
    "oauth": true
  }
}
```

If a provider gave you a pre-registered client or you want to pin endpoints,
pass an object instead of `true`:

```json
{
  "acme": {
    "type": "http",
    "url": "https://mcp.acme.com/mcp",
    "oauth": {
      "client_id": "your-client-id",
      "scopes": ["read", "write"],
      "authorization_endpoint": "https://auth.acme.com/authorize",
      "token_endpoint": "https://auth.acme.com/token"
    }
  }
}
```

Auto-discovery (RFC 8414 / RFC 9728) and dynamic client registration (RFC 7591)
fill in anything you omit. The browser step needs an interactive session — in
headless runs, connect once interactively (`/mcp connect <name>`) to mint the
stored token, which then refreshes on its own.

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
/mcp login <name>     // OAuth sign-in via browser (oauth servers)
/mcp logout <name>    // clear stored OAuth tokens for a server
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
- Deferred context engine concept: [Factory](https://factory.ai/news/deferred-context-engine)
- Compact schema compression: [mcp-context-proxy](https://github.com/kira-autonoma/mcp-context-proxy)

## License

MIT
