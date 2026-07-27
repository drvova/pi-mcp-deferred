export const ENABLED = '● enabled';
export const DISABLED = '○ disabled';
export function create_server_states(configs) {
    return new Map(configs.map((config) => [
        config.name,
        {
            config,
            tool_prefix: `mcp__${config.name}__`,
            tool_names: [],
            enabled: config.disabled !== true,
            status: 'disconnected',
            active_call_count: 0,
            promoted: false,
            result_cache: new Map(),
            last_result_hashes: null,
        },
    ]));
}
export function is_server_promoted(state) {
    return state.promoted === true;
}
export function mark_server_promoted(state) {
    state.promoted = true;
}
export function unmark_server_promoted(state) {
    state.promoted = false;
}
export function remove_server_tools_from_active(pi, tool_names) {
    const tool_set = new Set(tool_names);
    pi.setActiveTools(pi.getActiveTools().filter((tool) => !tool_set.has(tool)));
}
export function add_server_tools_to_active(pi, tool_names) {
    const active = new Set(pi.getActiveTools());
    for (const name of tool_names) active.add(name);
    pi.setActiveTools([...active]);
}
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export function get_mcp_idle_timeout_ms(state) {
    const configured = state.config.idle_timeout_ms;
    const env = process.env.MY_PI_MCP_IDLE_TIMEOUT_MS
        ? Number(process.env.MY_PI_MCP_IDLE_TIMEOUT_MS)
        : undefined;
    // Default to 30 min so idle servers actually disconnect (0 disables).
    const value = configured ?? env ?? DEFAULT_IDLE_TIMEOUT_MS;
    return value && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}
export function clear_mcp_idle_timer(state) {
    if (!state.idle_timer)
        return;
    clearTimeout(state.idle_timer);
    state.idle_timer = undefined;
}
export function format_server_status(state) {
    switch (state.status) {
        case 'connected':
            return state.enabled ? 'enabled' : 'disabled';
        case 'connecting':
            return state.enabled ? 'connecting' : 'connecting, disabled';
        case 'failed':
            return state.enabled ? 'failed' : 'failed, disabled';
        default:
            return state.enabled ? 'not connected yet' : 'disabled';
    }
}
export function redact_url(value) {
    try {
        const url = new URL(value);
        if (url.username)
            url.username = '***';
        if (url.password)
            url.password = '***';
        for (const key of url.searchParams.keys()) {
            if (/token|key|secret|password|auth/i.test(key)) {
                url.searchParams.set(key, '***');
            }
        }
        return url.toString();
    }
    catch {
        return value.replace(/(token|key|secret|password|auth)=([^\s&]+)/gi, '$1=***');
    }
}
export function summarize_mcp_tool_params(params) {
    try {
        const json = JSON.stringify(params);
        if (!json)
            return null;
        return json.length > 500 ? `${json.slice(0, 497)}...` : json;
    }
    catch {
        return null;
    }
}
export function format_server_target(config) {
    if (config.transport === 'http')
        return redact_url(config.url);
    return [config.command, ...(config.args ?? [])].join(' ');
}
export function count_pending_enabled_servers(servers) {
    return Array.from(servers.values()).filter((state) => state.enabled && state.status !== 'connected').length;
}
export function report_mcp_failure(state, ctx) {
    const message = `MCP server failed (${state.config.name}): ${state.error}`;
    try {
        if (ctx?.hasUI) {
            ctx.ui.notify(message, 'warning');
            return;
        }
    }
    catch {
        // ctx may be stale after session replacement
    }
    console.error(message);
}
function themed(ctx, color, text) {
    try {
        return ctx.ui.theme.fg(color, text);
    }
    catch {
        return text;
    }
}
export function update_mcp_status(ctx, servers) {
    try {
        if (!ctx.hasUI)
            return;
        if (servers.size === 0) {
            ctx.ui.setStatus('mcp', undefined);
            return;
        }
        const states = Array.from(servers.values());
        const enabled = states.filter((state) => state.enabled).length;
        const connected = states.filter((state) => state.enabled && state.status === 'connected').length;
        const connecting = states.filter((state) => state.enabled && state.status === 'connecting').length;
        const failed = states.filter((state) => state.enabled && state.status === 'failed').length;
        const fragments = [`MCP ${connected}/${enabled} connected`];
        if (connecting > 0)
            fragments.push(`${connecting} connecting`);
        if (failed > 0)
            fragments.push(`${failed} failed`);
        ctx.ui.setStatus('mcp', themed(ctx, 'dim', fragments.join(' · ')));
    }
    catch {
        // ctx may be stale after session replacement
    }
}
export function set_connect_feedback(ctx, pending_server_count) {
    try {
        if (!ctx.hasUI) {
            return () => { };
        }
    }
    catch {
        return () => { };
    }
    const label = pending_server_count === 1
        ? 'Connecting 1 MCP server...'
        : `Connecting ${pending_server_count} MCP servers...`;
    ctx.ui.setWorkingMessage(label);
    ctx.ui.setWorkingIndicator({
        frames: [
            themed(ctx, 'dim', '·'),
            themed(ctx, 'muted', '•'),
            themed(ctx, 'accent', '●'),
            themed(ctx, 'muted', '•'),
        ],
        intervalMs: 120,
    });
    ctx.ui.setStatus('mcp', themed(ctx, 'dim', label));
    return () => {
        ctx.ui.setWorkingMessage();
        ctx.ui.setWorkingIndicator();
    };
}
//# sourceMappingURL=server-state.js.map

// Result cache: keyed by "tool_name:param_hash"
const PARAM_HASH_MAX_LEN = 200;
export function get_cached_result(state, tool_name, params) {
    if (!state.result_cache) return null;
    const key = cache_key(tool_name, params);
    return state.result_cache.get(key) ?? null;
}
export function set_cached_result(state, tool_name, params, formatted) {
    if (!state.result_cache) return;
    // Limit cache size to 100 entries per server
    if (state.result_cache.size > 100) {
        const first = state.result_cache.keys().next().value;
        state.result_cache.delete(first);
    }
    state.result_cache.set(cache_key(tool_name, params), {
        formatted,
        hashes: formatted.details?.hashline ? extract_hashes(formatted.text) : null,
        timestamp: Date.now(),
    });
}
export function clear_result_cache(state) {
    state.result_cache?.clear();
    state.last_result_hashes = null;
}
function cache_key(tool_name, params) {
    const param_str = JSON.stringify(params ?? {});
    return `${tool_name}:${param_str.length > PARAM_HASH_MAX_LEN ? param_str.slice(0, PARAM_HASH_MAX_LEN) : param_str}`;
}
function extract_hashes(text) {
    const lines = text.split('\n');
    const hashes = [];
    for (const line of lines) {
        if (line.length >= 3 && line[3] === '\u2502') {
            hashes.push(line.slice(0, 3));
        }
    }
    return hashes.length > 0 ? hashes : null;
}

