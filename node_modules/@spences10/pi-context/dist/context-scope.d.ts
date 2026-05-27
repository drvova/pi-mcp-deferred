import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { ContextScopeOptions } from './store.js';
export declare function is_text_content(item: unknown): item is {
    type: 'text';
    text: string;
};
export declare function summarize_tool_input(input: unknown): string | null;
export declare function should_skip_tool(tool_name: string): boolean;
export declare function session_id_from_context(ctx?: Pick<ExtensionCommandContext, 'sessionManager'>): string | null;
export declare function scope_from_context(ctx?: Pick<ExtensionCommandContext, 'cwd' | 'sessionManager'>): ContextScopeOptions;
