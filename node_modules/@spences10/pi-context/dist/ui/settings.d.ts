import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
export declare function show_context_text_modal(ctx: ExtensionCommandContext, title: string, text: string): Promise<void>;
export declare function show_context_stats(ctx: ExtensionCommandContext): Promise<void>;
export declare function show_context_settings(ctx: ExtensionCommandContext, options?: {
    nested?: boolean;
}): Promise<void>;
export declare function handle_context_settings(ctx: ExtensionCommandContext, args: string[]): Promise<void>;
