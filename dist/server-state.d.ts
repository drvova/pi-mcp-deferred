import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { McpClient, type McpServerConfig } from './client.js';
export declare const ENABLED = "\u25CF enabled";
export declare const DISABLED = "\u25CB disabled";
export interface ServerState {
    config: McpServerConfig;
    client?: McpClient;
    tool_names: string[];
    enabled: boolean;
    status: 'disconnected' | 'connecting' | 'connected' | 'failed';
    error?: string;
    connect_promise?: Promise<void>;
    active_call_count: number;
    last_used_at?: number;
    idle_timer?: NodeJS.Timeout;
}
export declare function create_server_states(configs: McpServerConfig[]): Map<string, ServerState>;
export declare function remove_server_tools_from_active(pi: ExtensionAPI, tool_names: string[]): void;
export declare function get_mcp_idle_timeout_ms(state: ServerState): number | undefined;
export declare function clear_mcp_idle_timer(state: ServerState): void;
export declare function format_server_status(state: ServerState): string;
export declare function redact_url(value: string): string;
export declare function summarize_mcp_tool_params(params: unknown): string | null;
export declare function format_server_target(config: McpServerConfig): string;
export declare function count_pending_enabled_servers(servers: ReadonlyMap<string, ServerState>): number;
export declare function report_mcp_failure(state: ServerState, ctx?: ExtensionContext): void;
export declare function update_mcp_status(ctx: ExtensionContext, servers: ReadonlyMap<string, ServerState>): void;
export declare function set_connect_feedback(ctx: ExtensionContext, pending_server_count: number): () => void;
