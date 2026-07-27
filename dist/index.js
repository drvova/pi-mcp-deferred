import { defineTool, } from '@earendil-works/pi-coding-agent';
import { handle_mcp_backup, handle_mcp_restore, } from './backup-restore.js';
import { McpClient } from './client.js';
import { read_cached_tools, write_cached_tools } from './catalog-cache.js';
import { load_mcp_config, set_mcp_server_enabled } from './config.js';
import { create_mcp_tool_registration_metadata, create_stub_tool_metadata } from './metadata.js';
import { handle_mcp_profile } from './profile-actions.js';
import { get_project_mcp_config_load_decision } from './project-config-loader.js';
import { clear_token, ensure_oauth_config, is_oauth_enabled, load_token, run_interactive_login, } from './oauth.js';
import { format_mcp_tool_result } from './result.js';
import { clear_mcp_idle_timer, create_server_states, get_mcp_idle_timeout_ms, is_server_promoted, mark_server_promoted, unmark_server_promoted, remove_server_tools_from_active, report_mcp_failure, set_connect_feedback, summarize_mcp_tool_params, update_mcp_status, } from './server-state.js';
import { format_mcp_server_list, show_mcp_home_modal, show_mcp_server_modal, show_mcp_text_modal, show_oauth_server_picker, } from './ui.js';
export function should_wait_for_mcp_connections(event) {
    const selected_tools = event.systemPromptOptions?.selectedTools;
    return (selected_tools?.some((tool) => tool.startsWith('mcp__')) ?? false);
}
function should_defer_mcp(server_config) {
    // Per-server override takes priority
    if (server_config.deferred !== undefined) return server_config.deferred;
    // Env var override: MY_PI_MCP_DEFERRED=0 to disable, default ON
    if (process.env.MY_PI_MCP_DEFERRED === '0') return false;
    return true;
}
function should_catalog_mcp(server_config) {
    // Catalog tier: register no per-tool stubs; list the server in mcp__expand.
    // Per-server override wins (catalog:false pins a server to native stubs).
    if (server_config.catalog !== undefined) return server_config.catalog;
    // Env kill-switch: MY_PI_MCP_CATALOG=0 reverts to all-native stubs.
    if (process.env.MY_PI_MCP_CATALOG === '0') return false;
    return true;
}
export default async function mcp(pi) {
    let initialized_cwd = null;
    let initialize_promise;
    let servers = new Map();
    const registered_tool_names = new Set();
    // Tell Pi the tool set changed so re-registered schemas take effect immediately
    // (promote/expand/re-defer), not just at the next implicit rebuild.
    const refresh_tools = () => pi.refreshTools?.();
    // Proactive re-defer threshold: reclaim schema tokens once context usage crosses
    // this fraction, before compaction is forced. MY_PI_MCP_REDEFER_PCT overrides.
    const redefer_pct = () => {
        const v = Number(process.env.MY_PI_MCP_REDEFER_PCT);
        return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.75;
    };
    const ensure_servers = async (cwd, ctx) => {
        if (initialized_cwd !== null)
            return;
        if (initialize_promise) {
            await initialize_promise;
            return;
        }
        initialize_promise = (async () => {
            const project_decision = await get_project_mcp_config_load_decision(cwd, ctx);
            servers = create_server_states(load_mcp_config(cwd, {
                include_project: project_decision.include_project,
                project_metadata_trusted: project_decision.metadata_trusted,
            }));
            initialized_cwd = cwd;
        })();
        try {
            await initialize_promise;
        }
        finally {
            initialize_promise = undefined;
        }
    };
    const disconnect_server = async (state, ctx) => {
        clear_mcp_idle_timer(state);
        await state.connect_promise?.catch(() => { });
        await state.client?.disconnect().catch(() => { });
        state.client = undefined;
        state.oauth_access_token = undefined;
        if (state.status !== 'failed')
            state.status = 'disconnected';
        if (ctx)
            update_mcp_status(ctx, servers);
    };
    const schedule_idle_disconnect = (state, ctx) => {
        clear_mcp_idle_timer(state);
        const timeout_ms = get_mcp_idle_timeout_ms(state);
        if (!timeout_ms || state.status !== 'connected')
            return;
        state.idle_timer = setTimeout(() => {
            if (state.status !== 'connected' ||
                state.active_call_count > 0 ||
                Date.now() - (state.last_used_at ?? 0) < timeout_ms) {
                schedule_idle_disconnect(state, ctx);
                return;
            }
            void disconnect_server(state, ctx);
        }, timeout_ms);
        state.idle_timer.unref?.();
    };
    const ensure_server_connection = async (state, ctx) => {
        if (state.config.transport === 'http' && state.client) {
            const stored = load_token(state.config.name);
            const token_changed = stored?.access_token !== state.oauth_access_token;
            const token_expired = typeof stored?.expires_at === 'number' &&
                Date.now() >= stored.expires_at;
            if (token_changed || token_expired) {
                await disconnect_server(state, ctx);
            }
        }
        if (!state.client || state.status !== 'connected') {
            await connect_server(state, ctx);
        }
    };
    // Register a server's tools as stubs (deferred) or full schemas (eager).
    // Shared by connect (native tier) and mcp__expand (loading a catalogued server).
    const register_server_tools = (state, mcp_tools) => {
        const tool_names = [];
        const deferred = should_defer_mcp(state.config);
        for (const mcp_tool of mcp_tools) {
            const tool_name = `mcp__${state.config.name}__${mcp_tool.name}`;
            tool_names.push(tool_name);
            if (registered_tool_names.has(tool_name))
                continue;
            registered_tool_names.add(tool_name);
            if (deferred) {
                const stub = create_stub_tool_metadata(state.config.name, mcp_tool.name, mcp_tool.description, mcp_tool.inputSchema);
                const _original_tool_name = mcp_tool.name;
                pi.registerTool(defineTool({
                    name: tool_name,
                    label: stub.label,
                    description: stub.description,
                    parameters: stub.parameters,
                    execute: async (_id, params) => {
                        const was_stub = !is_server_promoted(state);
                        clear_mcp_idle_timer(state);
                        state.active_call_count += 1;
                        try {
                            // Connect BEFORE promoting: promote needs a live client,
                            // and a warm-cache stub is registered without connecting.
                            await ensure_server_connection(state);
                            if (was_stub) {
                                await promote_server_tools(state);
                            }
                            const client = state.client;
                            if (!client) throw new Error('Server disconnected before tool call');
                            const result = (await client.callTool(_original_tool_name, params));
                            const formatted = format_mcp_tool_result(result, {
                                tool_name,
                                input_summary: summarize_mcp_tool_params(params),
                            });
                            const prefix = was_stub
                                ? `[Promoted "${state.config.name}" on first call] `
                                : '';
                            return {
                                content: [{ type: 'text', text: prefix + formatted.text }],
                                details: formatted.details,
                            };
                        }
                        catch (err) {
                            if (was_stub) {
                                return {
                                    content: [{ type: 'text', text: `Tool "${_original_tool_name}" was auto-promoted from server "${state.config.name}" but execution failed: ${err instanceof Error ? err.message : String(err)}. The full schema is now loaded \u2014 please retry with the correct parameters.` }],
                                };
                            }
                            throw err;
                        }
                        finally {
                            state.active_call_count -= 1;
                            state.last_used_at = Date.now();
                            schedule_idle_disconnect(state, undefined);
                        }
                    },
                }));
            }
            else {
                const metadata = create_mcp_tool_registration_metadata(state.config, mcp_tool);
                pi.registerTool(defineTool({
                    name: tool_name,
                    label: metadata.label,
                    description: metadata.description,
                    parameters: metadata.parameters,
                    execute: async (_id, params) => {
                        clear_mcp_idle_timer(state);
                        state.active_call_count += 1;
                        try {
                            await ensure_server_connection(state);
                            const client = state.client;
                            if (!client) throw new Error('Server disconnected before tool call');
                            const result = (await client.callTool(mcp_tool.name, params));
                            const formatted = format_mcp_tool_result(result, {
                                tool_name,
                                input_summary: summarize_mcp_tool_params(params),
                            });
                            return {
                                content: [{ type: 'text', text: formatted.text }],
                                details: formatted.details,
                            };
                        }
                        finally {
                            state.active_call_count -= 1;
                            state.last_used_at = Date.now();
                            schedule_idle_disconnect(state, undefined);
                        }
                    },
                }));
            }
        }
        state.tool_names = tool_names;
        return tool_names;
    };
    const connect_server = async (state, ctx) => {
        if (state.status === 'connected')
            return;
        if (state.connect_promise) {
            await state.connect_promise;
            return;
        }
        state.connect_promise = (async () => {
            clear_mcp_idle_timer(state);
            state.status = 'connecting';
            state.error = undefined;
            if (ctx)
                update_mcp_status(ctx, servers);
            const resolve_config = async (interactive) => {
                if (state.config.transport !== 'http')
                    return state.config;
                if (!is_oauth_enabled(state.config))
                    return state.config;
                const authed = await ensure_oauth_config(state.config, ctx, { interactive });
                return authed ?? state.config;
            };
            const needs_interactive_oauth = (error) => state.config.transport === 'http' &&
                error?.status === 401 &&
                !state.config.headers?.Authorization &&
                Boolean(ctx?.hasUI);
            let client = new McpClient(await resolve_config(false));
            try {
                try {
                    await client.connect();
                }
                catch (error) {
                    if (!needs_interactive_oauth(error))
                        throw error;
                    await client.disconnect().catch(() => { });
                    const authed = await run_interactive_login(state.config, error.wwwAuthenticate, ctx);
                    client = new McpClient(authed);
                    await client.connect();
                }
                state.client = client;
                state.oauth_access_token = state.config.transport === 'http'
                    ? load_token(state.config.name)?.access_token
                    : undefined;
                const mcp_tools = await client.listTools();
                state.discovered_tools = mcp_tools;
                write_cached_tools(state.config, mcp_tools);
                if (should_catalog_mcp(state.config) &&
                    !is_server_promoted(state) &&
                    state.catalogued !== false) {
                    // Catalog tier: register no stubs; the server is listed in mcp__expand.
                    // (catalogued===false means it was already loaded — don't re-catalog.)
                    state.catalogued = true;
                    state.tool_names = mcp_tools.map((t) => `mcp__${state.config.name}__${t.name}`);
                }
                else {
                    state.catalogued = false;
                    register_server_tools(state, mcp_tools);
                }
                state.status = 'connected';
                state.last_used_at = Date.now();
                schedule_idle_disconnect(state, ctx);
                if (!state.enabled) {
                    remove_server_tools_from_active(pi, state.tool_names);
                }
                else if (!state.catalogued &&
                    (!process.env.MY_PI_RUNTIME_MODE ||
                        process.env.MY_PI_RUNTIME_MODE === 'interactive')) {
                    const active = pi.getActiveTools();
                    pi.setActiveTools([
                        ...new Set([...active, ...state.tool_names]),
                    ]);
                }
                if (!state.catalogued)
                    refresh_tools();
            }
            catch (error) {
                state.status = 'failed';
                state.error =
                    error instanceof Error ? error.message : String(error);
                state.client = undefined;
                state.oauth_access_token = undefined;
                await client.disconnect().catch(() => { });
                report_mcp_failure(state, ctx);
                throw error;
            }
            finally {
                state.connect_promise = undefined;
                if (ctx)
                    update_mcp_status(ctx, servers);
            }
        })();
        await state.connect_promise;
    };
    const promote_server_tools = async (state) => {
        if (!state.client || state.status !== 'connected') return;
        if (is_server_promoted(state)) return;
        mark_server_promoted(state);
        const mcp_tools = await state.client.listTools();
        for (const mcp_tool of mcp_tools) {
            const tool_name = `mcp__${state.config.name}__${mcp_tool.name}`;
            const metadata = create_mcp_tool_registration_metadata(state.config, mcp_tool);
            // Re-register with full schema — overwrites the stub
            pi.registerTool(defineTool({
                name: tool_name,
                label: metadata.label,
                description: metadata.description,
                parameters: metadata.parameters,
                execute: async (_id, params) => {
                    clear_mcp_idle_timer(state);
                    state.active_call_count += 1;
                    try {
                        await ensure_server_connection(state);
                        const client = state.client;
                        if (!client) throw new Error('Server disconnected before tool call');
                        const result = (await client.callTool(mcp_tool.name, params));
                        const formatted = format_mcp_tool_result(result, {
                            tool_name,
                            input_summary: summarize_mcp_tool_params(params),
                        });
                        return {
                            content: [{ type: 'text', text: formatted.text }],
                            details: formatted.details,
                        };
                    }
                    finally {
                        state.active_call_count -= 1;
                        state.last_used_at = Date.now();
                        schedule_idle_disconnect(state, undefined);
                    }
                },
            }));
        }
        refresh_tools();
    };
    // Load a catalogued server: register its tools (stub tier) from cached metadata,
    // move it out of the catalog, and activate the tools. No reconnect required.
    const load_catalog_server = (state, ctx) => {
        if (!state.catalogued || !state.discovered_tools)
            return 0;
        register_server_tools(state, state.discovered_tools);
        state.catalogued = false;
        if (state.enabled &&
            (!process.env.MY_PI_RUNTIME_MODE ||
                process.env.MY_PI_RUNTIME_MODE === 'interactive')) {
            const active = pi.getActiveTools();
            pi.setActiveTools([...new Set([...active, ...state.tool_names])]);
        }
        refresh_tools();
        if (ctx)
            update_mcp_status(ctx, servers);
        return state.tool_names.length;
    };
    const build_expand_description = () => {
        const base = 'Load an MCP server\'s tools. Servers start "catalogued" (listed but not loaded) to save context. Call mcp__expand with a server name to register its tools, then call the tool you need. Pass "all" to load everything.';
        const cat = Array.from(servers.values()).filter((s) => s.catalogued && s.enabled);
        if (cat.length === 0)
            return base;
        const lines = cat
            .sort((a, b) => a.config.name.localeCompare(b.config.name))
            .map((s) => {
            const tools = s.discovered_tools ?? [];
            if (tools.length === 0)
                return `- ${s.config.name} (loads on expand)`;
            const sample = tools.slice(0, 6).map((t) => t.name).join(', ');
            const more = tools.length > 6 ? ', \u2026' : '';
            return `- ${s.config.name} (${tools.length}): ${sample}${more}`;
        });
        return `${base}\n\nAvailable (not yet loaded):\n${lines.join('\n')}`;
    };
    let expand_sig = '';
    const catalog_signature = () => Array.from(servers.values())
        .filter((s) => s.catalogued && s.enabled)
        .map((s) => s.config.name)
        .sort()
        .join(',');
    const register_expand_tool = (ctx) => {
        expand_sig = catalog_signature();
        pi.registerTool(defineTool({
            name: 'mcp__expand',
            label: 'mcp: expand server schemas',
            description: build_expand_description(),
            promptSnippet: 'mcp__expand — load a catalogued MCP server\'s tools before calling them',
            promptGuidelines: [
                'MCP servers are catalogued to save context: their tools are listed in the mcp__expand description but are not callable until loaded.',
                'Before calling a tool from a catalogued server, call mcp__expand({ server }) to load it (or mcp__expand({ server: "all" })).',
                'The first call to a freshly loaded tool auto-loads its full schema; if a call is rejected on schema, retry once with corrected arguments.',
            ],
            parameters: {
                type: 'object',
                properties: {
                    server: {
                        type: 'string',
                        description: 'Server name to load/expand, or "all"',
                    },
                },
                required: ['server'],
            },
            execute: async (_id, params) => {
                await ensure_servers(ctx.cwd, ctx);
                const target = params.server;
                if (target === 'all') {
                    let loaded = 0;
                    let promoted = 0;
                    for (const state of servers.values()) {
                        if (state.catalogued) {
                            if (!state.discovered_tools)
                                await connect_server(state, ctx);
                            loaded += load_catalog_server(state, ctx);
                        }
                    }
                    for (const state of servers.values()) {
                        if (!state.catalogued &&
                            state.status === 'connected' &&
                            !is_server_promoted(state)) {
                            await promote_server_tools(state);
                            promoted += 1;
                        }
                    }
                    register_expand_tool(ctx);
                    return {
                        content: [{ type: 'text', text: `Loaded ${loaded} catalogued tool(s); promoted ${promoted} server(s). Full schemas load on first call.` }],
                    };
                }
                const state = servers.get(target);
                if (!state) {
                    return {
                        content: [{ type: 'text', text: `Unknown server: ${target}. Available: ${Array.from(servers.keys()).join(', ')}` }],
                    };
                }
                if (state.catalogued) {
                    // Cold cache: connect once to discover (and populate the cache).
                    if (!state.discovered_tools)
                        await connect_server(state, ctx);
                    const n = load_catalog_server(state, ctx);
                    register_expand_tool(ctx);
                    return {
                        content: [{ type: 'text', text: `Loaded "${target}": ${n} tool(s) now callable. Call one to load its full schema.` }],
                    };
                }
                if (state.status !== 'connected') {
                    return {
                        content: [{ type: 'text', text: `Server "${target}" is not connected (status: ${state.status}).` }],
                    };
                }
                if (is_server_promoted(state)) {
                    return {
                        content: [{ type: 'text', text: `Server "${target}" already loaded with full schemas.` }],
                    };
                }
                await promote_server_tools(state);
                return {
                    content: [{ type: 'text', text: `Expanded "${target}". ${state.tool_names.length} tools now have full schemas.` }],
                };
            },
        }));
        refresh_tools();
    };
    // Build the catalog from disk cache at startup WITHOUT connecting. Servers
    // spawn only when a tool is actually used, so subagent sessions that inherit
    // this extension don't leak an MCP process pool per child.
    const hydrate_from_cache = (ctx) => {
        for (const state of servers.values()) {
            if (!state.enabled || state.status === 'connected' || state.discovered_tools)
                continue;
            const cached = read_cached_tools(state.config);
            if (should_catalog_mcp(state.config)) {
                state.catalogued = true;
                if (cached) {
                    state.discovered_tools = cached;
                    state.tool_names = cached.map((t) => `mcp__${state.config.name}__${t.name}`);
                }
            }
            else if (cached) {
                // Pinned native server, warm cache: register from cache, no spawn.
                state.discovered_tools = cached;
                state.catalogued = false;
                register_server_tools(state, cached);
                if (!process.env.MY_PI_RUNTIME_MODE ||
                    process.env.MY_PI_RUNTIME_MODE === 'interactive') {
                    const active = pi.getActiveTools();
                    pi.setActiveTools([...new Set([...active, ...state.tool_names])]);
                }
                refresh_tools();
            }
            else {
                // Pinned native server, cold cache: connect once to populate it.
                connect_server(state, ctx).catch(() => {});
            }
        }
        if (ctx)
            update_mcp_status(ctx, servers);
    };
    // Phase 4: re-defer promoted servers to compact stubs when the context window
    // is under pressure. Reclaims ~69% of a server's schema tokens; tools stay
    // visible and auto-promote again on next call. Skips in-flight calls and
    // servers pinned to full schemas (deferred:false).
    const redefer_idle_servers = (ctx) => {
        let reclaimed = 0;
        for (const state of servers.values()) {
            if (!is_server_promoted(state) ||
                state.active_call_count > 0 ||
                !state.discovered_tools ||
                !should_defer_mcp(state.config))
                continue;
            // Drop the registration guard so stubs overwrite the full schemas.
            for (const name of state.tool_names)
                registered_tool_names.delete(name);
            unmark_server_promoted(state);
            register_server_tools(state, state.discovered_tools);
            // Re-schedule idle disconnect so the server doesn't stay connected forever.
            schedule_idle_disconnect(state, ctx);
            reclaimed += 1;
        }
        if (reclaimed) {
            refresh_tools();
            if (ctx)
                update_mcp_status(ctx, servers);
        }
        return reclaimed;
    };
    const oauth_login = async (name, ctx) => {
        const server = servers.get(name);
        if (!server) {
            ctx.ui.notify(`Unknown server: ${name}`, 'warning');
            return;
        }
        if (server.config.transport !== 'http' || !is_oauth_enabled(server.config)) {
            ctx.ui.notify(`${name} is not an OAuth server (add "oauth": true)`, 'warning');
            return;
        }
        if (!ctx.hasUI) {
            ctx.ui.notify('OAuth login requires interactive mode', 'warning');
            return;
        }
        try {
            await run_interactive_login(server.config, undefined, ctx);
            await disconnect_server(server, ctx);
            await connect_server(server, ctx);
            ctx.ui.notify(`Signed in to ${name}`);
        }
        catch (error) {
            ctx.ui.notify(`OAuth login failed for ${name}: ${error instanceof Error ? error.message : String(error)}`, 'warning');
        }
    };
    const oauth_logout = async (name, ctx) => {
        const server = servers.get(name);
        if (!server) {
            ctx.ui.notify(`Unknown server: ${name}`, 'warning');
            return;
        }
        const cleared = clear_token(name);
        await disconnect_server(server, ctx);
        update_mcp_status(ctx, servers);
        ctx.ui.notify(cleared ? `Signed out of ${name}` : `${name} had no stored token`);
    };
    const set_server_enabled = (name, enabled, ctx) => {
        const server = servers.get(name);
        if (!server)
            return undefined;
        server.enabled = enabled;
        server.config.disabled = !enabled;
        set_mcp_server_enabled(ctx.cwd, name, enabled);
        if (!enabled) {
            remove_server_tools_from_active(pi, server.tool_names);
            void disconnect_server(server, ctx);
            update_mcp_status(ctx, servers);
            return server;
        }
        if (server.status === 'connected') {
            const active = pi.getActiveTools();
            pi.setActiveTools([
                ...new Set([...active, ...server.tool_names]),
            ]);
            update_mcp_status(ctx, servers);
            return server;
        }
        if (server.status === 'failed') {
            server.status = 'disconnected';
            server.error = undefined;
        }
        update_mcp_status(ctx, servers);
        // Discover at startup: connect to register stubs. Context is deferred via
        // compact schemas (Phase 1), not by deferring the connection itself.
        connect_server(server, ctx).catch(() => {});
        return server;
    };
    pi.on('session_start', async (_event, ctx) => {
        await ensure_servers(ctx.cwd, ctx);
        // Phase 0 Catalog (startup): build the listing from the disk cache WITHOUT
        // connecting. Servers spawn only on first use, so subagent sessions that
        // inherit this extension don't leak a process pool per child.
        hydrate_from_cache(ctx);
        register_expand_tool(ctx);
    });
    pi.on('before_agent_start', async (event, ctx) => {
        await ensure_servers(ctx.cwd, ctx);
        // Refresh the catalog listing for servers that connected since last turn.
        if (catalog_signature() !== expand_sig)
            register_expand_tool(ctx);
        // Proactive re-defer: reclaim schema tokens once context usage is high,
        // before it forces a destructive compaction. Backstopped by Phase 4.
        const usage = ctx.getContextUsage?.();
        if (usage && usage.percent != null) {
            const p = usage.percent > 1 ? usage.percent / 100 : usage.percent;
            if (p >= redefer_pct())
                redefer_idle_servers(ctx);
        }
        if (!should_wait_for_mcp_connections(event)) {
            // No MCP tools selected this turn: do NOT connect anything. The catalog
            // listing already comes from cache; servers spawn only on actual use.
            return event;
        }
        const selected_server_names = new Set((event.systemPromptOptions?.selectedTools ?? [])
            .map((tool) => /^mcp__(.+)__(.+)$/.exec(tool)?.[1])
            .filter((name) => Boolean(name)));
        const target_servers = Array.from(servers.values()).filter((state) => state.enabled &&
            (selected_server_names.size === 0 ||
                selected_server_names.has(state.config.name)));
        const pending = count_pending_enabled_servers(target_servers);
        if (pending === 0) {
            update_mcp_status(ctx, servers);
            return event;
        }
        const restore_feedback = set_connect_feedback(ctx, pending_server_count);
        try {
            await Promise.allSettled(target_servers.map((state) => connect_server(state, ctx)));
            return event;
        }
        finally {
            restore_feedback();
            update_mcp_status(ctx, servers);
        }
    });
    pi.registerCommand('mcp', {
        description: 'Manage MCP servers (modal, list, enable, disable, connect, login, logout, backup, restore, profiles)',
        getArgumentCompletions: (prefix) => {
            const parts = prefix.split(' ');
            if (parts.length <= 1) {
                return [
                    'manage',
                    'list',
                    'enable',
                    'disable',
                    'connect',
                    'login',
                    'logout',
                    'backup',
                    'restore',
                    'profile',
                    'profiles',
                ]
                    .filter((s) => s.startsWith(prefix))
                    .map((s) => ({ value: s, label: s }));
            }
            if (parts[0] === 'profile') {
                return ['list', 'save', 'load']
                    .filter((s) => s.startsWith(parts[1] || ''))
                    .map((s) => ({ value: `profile ${s}`, label: s }));
            }
            if (parts[0] === 'enable' ||
                parts[0] === 'disable' ||
                parts[0] === 'connect' ||
                parts[0] === 'login' ||
                parts[0] === 'logout') {
                const name_prefix = parts[1] || '';
                return Array.from(servers.keys())
                    .filter((n) => n.startsWith(name_prefix))
                    .map((n) => ({
                    value: `${parts[0]} ${n}`,
                    label: n,
                }));
            }
            return null;
        },
        handler: async (args, ctx) => {
            await ensure_servers(ctx.cwd, ctx);
            const parts = args.trim().split(/\s+/).filter(Boolean);
            if (parts.length === 0 && ctx.hasUI) {
                let selected;
                while ((selected = await show_mcp_home_modal(ctx, servers))) {
                    if (selected === 'manage') {
                        await show_mcp_server_modal(ctx, servers, set_server_enabled);
                    }
                    else if (selected === 'list') {
                        update_mcp_status(ctx, servers);
                        await show_mcp_text_modal(ctx, 'MCP servers', format_mcp_server_list(servers));
                    }
                    else if (selected === 'backup') {
                        await handle_mcp_backup(ctx);
                    }
                    else if (selected === 'restore') {
                        if (await handle_mcp_restore(ctx))
                            return;
                    }
                    else if (selected === 'oauth login' ||
                        selected === 'oauth logout') {
                        const action = selected === 'oauth login' ? 'login' : 'logout';
                        const target = await show_oauth_server_picker(ctx, servers, action);
                        if (target) {
                            if (action === 'login')
                                await oauth_login(target, ctx);
                            else
                                await oauth_logout(target, ctx);
                        }
                    }
                    else if (selected.startsWith('profile ')) {
                        if (await handle_mcp_profile(ctx, selected.split(/\s+/).slice(1))) {
                            return;
                        }
                    }
                    await ensure_servers(ctx.cwd, ctx);
                }
                return;
            }
            const [sub, ...rest] = parts;
            const name = rest.join(' ');
            switch (sub || 'manage') {
                case 'manage':
                case 'toggle': {
                    if (await show_mcp_server_modal(ctx, servers, set_server_enabled))
                        return;
                    ctx.ui.notify('MCP modal requires interactive mode', 'warning');
                    break;
                }
                case 'backup': {
                    await handle_mcp_backup(ctx);
                    break;
                }
                case 'restore': {
                    await handle_mcp_restore(ctx, rest.join(' ') || undefined);
                    break;
                }
                case 'profile':
                case 'profiles': {
                    await handle_mcp_profile(ctx, sub === 'profiles' ? ['list', ...rest] : rest);
                    break;
                }
                case 'list': {
                    const text = format_mcp_server_list(servers);
                    update_mcp_status(ctx, servers);
                    if (ctx.hasUI)
                        await show_mcp_text_modal(ctx, 'MCP servers', text);
                    else
                        ctx.ui.notify(text);
                    break;
                }
                case 'connect': {
                    const targets = name && name !== 'all'
                        ? [servers.get(name)].filter((server) => Boolean(server))
                        : Array.from(servers.values()).filter((server) => server.enabled);
                    if (targets.length === 0) {
                        ctx.ui.notify(name
                            ? `Unknown server: ${name}`
                            : 'No enabled MCP servers', 'warning');
                        return;
                    }
                    await Promise.allSettled(targets.map((server) => connect_server(server, ctx)));
                    ctx.ui.notify(`Connected ${targets.length} MCP server${targets.length === 1 ? '' : 's'}`);
                    break;
                }
                case 'enable': {
                    const server = servers.get(name);
                    if (!server) {
                        ctx.ui.notify(`Unknown server: ${name}`, 'warning');
                        return;
                    }
                    if (server.enabled && server.status !== 'failed') {
                        ctx.ui.notify(`${name} already enabled`);
                        return;
                    }
                    set_server_enabled(name, true, ctx);
                    ctx.ui.notify(server.status === 'connected'
                        ? `Enabled ${name}`
                        : `Enabled ${name}; use /mcp connect ${name} to connect now`);
                    break;
                }
                case 'disable': {
                    const server = servers.get(name);
                    if (!server) {
                        ctx.ui.notify(`Unknown server: ${name}`, 'warning');
                        return;
                    }
                    if (!server.enabled) {
                        ctx.ui.notify(`${name} already disabled`);
                        return;
                    }
                    set_server_enabled(name, false, ctx);
                    ctx.ui.notify(`Disabled ${name}`);
                    break;
                }
                case 'login': {
                    await oauth_login(name, ctx);
                    break;
                }
                case 'logout': {
                    await oauth_logout(name, ctx);
                    break;
                }
                default:
                    ctx.ui.notify(`Unknown subcommand: ${sub}. Use manage, list, enable, disable, connect, login, logout, backup, restore, or profile.`, 'warning');
            }
        },
    });
    if (process.env.MY_PI_RUNTIME_MODE &&
        process.env.MY_PI_RUNTIME_MODE !== 'interactive') {
        // Headless/non-interactive (incl. subagent) load: hydrate the catalog from
        // cache instead of spawning every server. Servers connect only on use, so
        // subagent sessions don't leak a process pool per child.
        await ensure_servers(process.cwd());
        hydrate_from_cache();
    }
    pi.on('session_before_compact', async (event, ctx) => {
        // Only reclaim on automatic compaction (threshold/overflow), not manual /compact.
        if (event.reason === 'manual')
            return;
        const n = redefer_idle_servers(ctx);
        if (n && ctx?.hasUI)
            ctx.ui.notify(`Re-deferred ${n} idle MCP server(s) to reclaim context`);
    });
    pi.on('session_shutdown', async (_event, ctx) => {
        await Promise.allSettled(Array.from(servers.values()).map(async (server) => {
            await disconnect_server(server, ctx);
        }));
        try {
            ctx.ui.setStatus('mcp', undefined);
        }
        catch {
            // ctx stale after session replacement
        }
    });
}
//# sourceMappingURL=index.js.map