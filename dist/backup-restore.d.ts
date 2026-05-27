import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
export declare function reload_after_config_change(ctx: ExtensionCommandContext, message: string): Promise<void>;
export declare function handle_mcp_backup(ctx: ExtensionCommandContext): Promise<void>;
export declare function confirm_mcp_action(ctx: ExtensionCommandContext, options: {
    title: string;
    message: string;
    confirm_label?: string;
}): Promise<boolean>;
export declare function handle_mcp_restore(ctx: ExtensionCommandContext, requested_file?: string): Promise<boolean>;
