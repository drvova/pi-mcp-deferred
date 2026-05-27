import { show_confirm_modal, show_picker_modal, } from '@spences10/pi-tui-modal';
import { create_mcp_config_backup, list_mcp_config_backups, restore_mcp_config_backup, } from './config.js';
export async function reload_after_config_change(ctx, message) {
    ctx.ui.notify(`${message} Reloading MCP extension...`, 'info');
    await ctx.reload();
}
export async function handle_mcp_backup(ctx) {
    const backup = create_mcp_config_backup(ctx.cwd);
    ctx.ui.notify(`MCP backup created: ${backup.filename} (${backup.global_server_count} global, ${backup.project_server_count} project servers)`, 'info');
}
export async function confirm_mcp_action(ctx, options) {
    if (!ctx.hasUI) {
        return await ctx.ui.confirm(options.title, options.message);
    }
    return await show_confirm_modal(ctx, {
        title: options.title,
        message: options.message,
        confirm_label: options.confirm_label,
    });
}
export async function handle_mcp_restore(ctx, requested_file) {
    const backups = list_mcp_config_backups();
    if (backups.length === 0) {
        ctx.ui.notify('No MCP backups found', 'warning');
        return false;
    }
    let selected_path = requested_file
        ? backups.find((backup) => backup.filename === requested_file ||
            backup.path === requested_file)?.path
        : undefined;
    if (!selected_path) {
        selected_path = await show_picker_modal(ctx, {
            title: 'Restore MCP backup',
            subtitle: 'Restores global and project MCP config exactly as captured',
            items: backups.map((backup) => ({
                value: backup.path,
                label: backup.filename,
                description: `${backup.global_server_count} global • ${backup.project_server_count} project • ${backup.created_at}`,
            })),
            empty_message: 'No MCP backups found',
        });
    }
    if (!selected_path)
        return false;
    const confirmed = await confirm_mcp_action(ctx, {
        title: 'Restore MCP backup?',
        message: 'This replaces current global/project MCP config with the selected backup.',
        confirm_label: 'Restore backup',
    });
    if (!confirmed)
        return false;
    const restored = restore_mcp_config_backup(ctx.cwd, selected_path);
    await reload_after_config_change(ctx, `Restored ${restored.filename}.`);
    return true;
}
//# sourceMappingURL=backup-restore.js.map