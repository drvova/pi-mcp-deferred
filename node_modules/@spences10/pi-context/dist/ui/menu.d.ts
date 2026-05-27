import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
export declare function show_context_list(ctx: ExtensionCommandContext, limit?: number): Promise<void>;
export declare function purge_context(ctx: ExtensionCommandContext, options?: {
    older_than_days?: number;
    source_id?: string;
    expired?: boolean;
}): Promise<void>;
export declare function show_context_menu(ctx: ExtensionCommandContext): Promise<void>;
