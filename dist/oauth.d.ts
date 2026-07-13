import type { McpHttpServerConfig } from './client.js';
export interface StoredOAuthToken {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    token_endpoint: string;
    client_id?: string;
    client_secret?: string;
}
export interface McpToolContext {
    hasUI?: boolean;
    ui?: {
        notify(message: string): void;
    };
}
export declare function load_token(name: string): StoredOAuthToken | undefined;
export declare function save_token(name: string, token: StoredOAuthToken): void;
export declare function is_oauth_enabled(config: McpHttpServerConfig): boolean;
export declare function apply_bearer(config: McpHttpServerConfig, access_token: string): McpHttpServerConfig;
export declare function set_browser_opener(fn?: (url: string) => void | Promise<unknown>): void;
export declare function ensure_oauth_config(config: McpHttpServerConfig, ctx?: McpToolContext, options?: {
    interactive?: boolean;
    www_authenticate?: string;
}): Promise<McpHttpServerConfig | undefined>;
export declare function run_interactive_login(config: McpHttpServerConfig, www_authenticate: string | undefined, ctx?: McpToolContext): Promise<McpHttpServerConfig>;
