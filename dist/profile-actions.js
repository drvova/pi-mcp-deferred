import { show_input_modal, show_picker_modal, } from '@spences10/pi-tui-modal';
import { confirm_mcp_action, reload_after_config_change, } from './backup-restore.js';
import { list_mcp_profiles, load_mcp_profile, save_mcp_profile, } from './config.js';
import { show_mcp_text_modal } from './ui.js';
export async function load_profile(ctx, name, scope) {
    const confirmed = await confirm_mcp_action(ctx, {
        title: 'Load MCP profile?',
        message: `This replaces ${scope} MCP config with profile ${name}.`,
        confirm_label: 'Load profile',
    });
    if (!confirmed)
        return false;
    try {
        const profile = load_mcp_profile(ctx.cwd, name, scope);
        await reload_after_config_change(ctx, `Loaded MCP profile ${profile.name} (${profile.server_count} servers).`);
        return true;
    }
    catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), 'warning');
        return false;
    }
}
export async function show_mcp_profile_actions(ctx, name) {
    const profile = list_mcp_profiles().find((item) => item.name === name);
    if (!profile) {
        ctx.ui.notify(`MCP profile not found: ${name}`, 'warning');
        return false;
    }
    const action = await show_picker_modal(ctx, {
        title: `MCP profile: ${profile.name}`,
        subtitle: `${profile.server_count} server(s)${profile.created_at ? ` • ${profile.created_at}` : ''}`,
        items: [
            {
                value: 'load-global',
                label: 'Load as global config',
                description: 'Replace ~/.pi/agent/mcp.json',
            },
            {
                value: 'load-project',
                label: 'Load as project config',
                description: 'Replace ./mcp.json for this project',
            },
            {
                value: 'inspect',
                label: 'Inspect profile',
                description: 'Show path, creation date, and server count',
            },
        ],
        footer: 'enter selects • esc back',
    });
    if (action === 'load-global')
        return await load_profile(ctx, profile.name, 'global');
    if (action === 'load-project')
        return await load_profile(ctx, profile.name, 'project');
    if (action === 'inspect') {
        await show_mcp_text_modal(ctx, `MCP profile: ${profile.name}`, [
            `Name: ${profile.name}`,
            `Servers: ${profile.server_count}`,
            `Created: ${profile.created_at ?? 'unknown'}`,
            `Path: ${profile.path}`,
        ].join('\n'));
    }
    return false;
}
export async function handle_mcp_profile(ctx, args) {
    const action = args[0] ?? 'load';
    if (action === 'list') {
        const profiles = list_mcp_profiles();
        if (profiles.length === 0) {
            ctx.ui.notify('No MCP profiles saved');
            return false;
        }
        if (!ctx.hasUI) {
            ctx.ui.notify(profiles
                .map((profile) => `${profile.name} — ${profile.server_count} servers`)
                .join('\n'));
            return false;
        }
        const requested = args[1];
        const selected = requested ??
            (await show_picker_modal(ctx, {
                title: 'MCP profiles',
                subtitle: `${profiles.length} saved profile(s)`,
                items: profiles.map((profile) => ({
                    value: profile.name,
                    label: profile.name,
                    description: `${profile.server_count} servers${profile.created_at ? ` • ${profile.created_at}` : ''}`,
                })),
                empty_message: 'No MCP profiles saved',
                footer: 'enter opens actions • esc back',
            }));
        return selected
            ? await show_mcp_profile_actions(ctx, selected)
            : false;
    }
    if (action === 'save') {
        const name = args[1] ??
            (ctx.hasUI
                ? await show_input_modal(ctx, {
                    title: 'Save MCP profile',
                    label: 'Profile name',
                    subtitle: 'letters, numbers, underscores, hyphens',
                })
                : await ctx.ui.input('Save MCP profile', 'letters, numbers, underscores, hyphens'));
        if (!name)
            return false;
        try {
            const profile = save_mcp_profile(ctx.cwd, name);
            ctx.ui.notify(`Saved MCP profile ${profile.name} (${profile.server_count} servers)`, 'info');
        }
        catch (error) {
            ctx.ui.notify(error instanceof Error ? error.message : String(error), 'warning');
        }
        return false;
    }
    if (action !== 'load') {
        ctx.ui.notify('Unknown profile action. Use profile list, profile save, or profile load.', 'warning');
        return false;
    }
    const profiles = list_mcp_profiles();
    if (profiles.length === 0) {
        ctx.ui.notify('No MCP profiles saved', 'warning');
        return false;
    }
    let name = args[1];
    if (!name) {
        const selected = await show_picker_modal(ctx, {
            title: 'Load MCP profile',
            subtitle: 'Applies saved servers to global MCP config by default',
            items: profiles.map((profile) => ({
                value: profile.name,
                label: profile.name,
                description: `${profile.server_count} servers${profile.created_at ? ` • ${profile.created_at}` : ''}`,
            })),
            empty_message: 'No MCP profiles saved',
        });
        if (!selected)
            return false;
        name = selected;
    }
    const scope = (args[2] === 'project' ? 'project' : 'global');
    return await load_profile(ctx, name, scope);
}
//# sourceMappingURL=profile-actions.js.map