import { defineTool, } from '@earendil-works/pi-coding-agent';
import { handle_mcp_backup, handle_mcp_restore, } from './backup-restore.js';
import { McpClient } from './client.js';
import { load_mcp_config, set_mcp_server_enabled } from './config.js';
import { create_mcp_tool_registration_metadata, create_stub_tool_metadata } from './metadata.js';
import { handle_mcp_profile } from './profile-actions.js';
import { get_project_mcp_config_load_decision } from './project-config-loader.js';
import { format_mcp_tool_result } from './result.js';
import { clear_mcp_idle_timer, create_server_states, get_mcp_idle_timeout_ms, is_server_promoted, mark_server_promoted, remove_server_tools_from_active, report_mcp_failure, set_connect_feedback, summarize_mcp_tool_params, update_mcp_status, } from './server-state.js';
import { format_mcp_server_list, show_mcp_home_modal, show_mcp_server_modal, show_mcp_text_modal, } from './ui.js';
export function should_wait_for_mcp_connections(event) {
    const selected_tools = event.systemPromptOptions?.selectedTools;
    return (selected_tools?.some((tool) => tool.startsWith('mcp__')) ?? false);
}
function should_eager_connect_mcp() {
    return process.env.MY_PI_MCP_EAGER_CONNECT === '1';
}
function should_defer_mcp(server_config) {
    // Per-server override takes priority
    if (server_config.deferred !== undefined) return server_config.deferred;
    // Env var override: MY_PI_MCP_DEFERRED=0 to disable, default ON
    if (process.env.MY_PI_MCP_DEFERRED === '0') return false;
    return true;
}
export default async function mcp(pi) {
    let initialized_cwd = null;
    let initialize_promise;
    let servers = new Map();
    const registered_tool_names = new Set();
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
            const client = new McpClient(state.config);
            try {
                await client.connect();
                state.client = client;
                const mcp_tools = await client.listTools();
                const tool_names = [];
                const deferred = should_defer_mcp(state.config);
                for (const mcp_tool of mcp_tools) {
                    const tool_name = `mcp__${state.config.name}__${mcp_tool.name}`;
                    tool_names.push(tool_name);
                    if (registered_tool_names.has(tool_name))
                        continue;
                    registered_tool_names.add(tool_name);
                    if (deferred) {
                        // DEFERRED: register compact stub
                        const stub = create_stub_tool_metadata(state.config.name, mcp_tool.name, mcp_tool.description);
                        pi.registerTool(defineTool({
                            name: tool_name,
                            label: stub.label,
                            description: stub.description,
                            parameters: stub.parameters,
                            execute: async (_id, params) => {
                                // Auto-promote this server on first call
                                if (!is_server_promoted(state)) {
                                    await promote_server_tools(state);
                                }
                                // Execute with full client
                                clear_mcp_idle_timer(state);
                                state.active_call_count += 1;
                                try {
                                    if (!state.client || state.status !== 'connected') {
                                        await connect_server(state);
                                    }
                                    const result = (await state.client.callTool(mcp_tool.name, params));
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
                    else {
                        // EAGER: register full schema (original behavior)
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
                                    if (!state.client || state.status !== 'connected') {
                                        await connect_server(state);
                                    }
                                    const result = (await state.client.callTool(mcp_tool.name, params));
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
                state.status = 'connected';
                state.last_used_at = Date.now();
                schedule_idle_disconnect(state, ctx);
                if (!state.enabled) {
                    remove_server_tools_from_active(pi, state.tool_names);
                }
                else if (!process.env.MY_PI_RUNTIME_MODE ||
                    process.env.MY_PI_RUNTIME_MODE === 'interactive') {
                    const active = pi.getActiveTools();
                    pi.setActiveTools([
                        ...new Set([...active, ...state.tool_names]),
                    ]);
                }
            }
            catch (error) {
                state.status = 'failed';
                state.error =
                    error instanceof Error ? error.message : String(error);
                state.client = undefined;
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
    const connect_all_servers = async (options = {}) => {
        await Promise.allSettled(Array.from(servers.values())
            .filter((state) => state.enabled)
            .filter((state) => options.include_failed || state.status !== 'failed')
            .map((state) => connect_server(state, options.ctx)));
        if (options.ctx)
            update_mcp_status(options.ctx, servers);
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
                        if (!state.client || state.status !== 'connected') {
                            await connect_server(state);
                        }
                        const result = (await state.client.callTool(mcp_tool.name, params));
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
        if (should_eager_connect_mcp())
            void connect_server(server, ctx);
        return server;
    };
    pi.on('session_start', async (_event, ctx) => {
        await ensure_servers(ctx.cwd, ctx);
        update_mcp_status(ctx, servers);
        if (should_eager_connect_mcp())
            void connect_all_servers({ ctx });
        // Register mcp__expand tool for explicit schema promotion
        pi.registerTool(defineTool({
            name: 'mcp__expand',
            label: 'mcp: expand server schemas',
            description: 'Load full tool schemas from an MCP server. Call this when you need detailed parameter info for a server\'s tools. Pass the server name to promote, or "all" to promote all connected servers.',
            parameters: {
                type: 'object',
                properties: {
                    server: {
                        type: 'string',
                        description: 'Server name to expand, or "all" for all connected servers',
                    },
                },
                required: ['server'],
            },
            execute: async (_id, params) => {
                await ensure_servers(ctx.cwd, ctx);
                const target = params.server;
                if (target === 'all') {
                    const connected = Array.from(servers.values())
                        .filter(s => s.status === 'connected' && !is_server_promoted(s));
                    for (const state of connected) {
                        await promote_server_tools(state);
                    }
                    return {
                        content: [{ type: 'text', text: `Expanded ${connected.length} server(s). Full schemas now available.` }],
                    };
                }
                const state = servers.get(target);
                if (!state) {
                    return {
                        content: [{ type: 'text', text: `Unknown server: ${target}. Available: ${Array.from(servers.keys()).join(', ')}` }],
                    };
                }
                if (state.status !== 'connected') {
                    return {
                        content: [{ type: 'text', text: `Server "${target}" is not connected (status: ${state.status}). Use /mcp connect ${target} first.` }],
                    };
                }
                if (is_server_promoted(state)) {
                    return {
                        content: [{ type: 'text', text: `Server "${target}" already expanded. Full schemas loaded.` }],
                    };
                }
                await promote_server_tools(state);
                return {
                    content: [{ type: 'text', text: `Expanded "${target}". ${state.tool_names.length} tools now have full schemas.` }],
                };
            },
        }));
    });
    pi.on('before_agent_start', async (event, ctx) => {
        await ensure_servers(ctx.cwd, ctx);
        if (!should_wait_for_mcp_connections(event)) {
            await connect_all_servers({ ctx });
            return event;
        }
        const selected_server_names = new Set((event.systemPromptOptions?.selectedTools ?? [])
            .map((tool) => /^mcp__(.+)__[^_]+$/.exec(tool)?.[1])
            .filter((name) => Boolean(name)));
        const target_servers = Array.from(servers.values()).filter((state) => state.enabled &&
            (selected_server_names.size === 0 ||
                selected_server_names.has(state.config.name)));
        const pending_server_count = target_servers.filter((state) => state.status !== 'connected').length;
        if (pending_server_count === 0) {
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
        description: 'Manage MCP servers (modal, list, enable, disable, connect, backup, restore, profiles)',
        getArgumentCompletions: (prefix) => {
            const parts = prefix.split(' ');
            if (parts.length <= 1) {
                return [
                    'manage',
                    'list',
                    'enable',
                    'disable',
                    'connect',
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
                parts[0] === 'connect') {
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
                default:
                    ctx.ui.notify(`Unknown subcommand: ${sub}. Use manage, list, enable, disable, connect, backup, restore, or profile.`, 'warning');
            }
        },
    });
    if (should_eager_connect_mcp() &&
        process.env.MY_PI_RUNTIME_MODE &&
        process.env.MY_PI_RUNTIME_MODE !== 'interactive') {
        await ensure_servers(process.cwd());
        await connect_all_servers({ include_failed: true });
    }
    pi.on('session_shutdown', async (_event, ctx) => {
        await Promise.allSettled(Array.from(servers.values()).map(async (server) => {
            await disconnect_server(server, ctx);
        }));
        ctx.ui.setStatus('mcp', undefined);
    });
}
//# sourceMappingURL=index.js.map