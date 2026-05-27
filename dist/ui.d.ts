import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { type ServerState } from './server-state.js';
export declare function format_mcp_server_list(servers: Map<string, ServerState>): string;
export declare function show_mcp_home_modal(ctx: ExtensionCommandContext, servers: Map<string, ServerState>): Promise<string | undefined>;
export declare function show_mcp_text_modal(ctx: ExtensionCommandContext, title: string, text: string): Promise<void>;
export declare function show_mcp_server_modal(ctx: ExtensionCommandContext, servers: Map<string, ServerState>, set_server_enabled: (name: string, enabled: boolean, ctx: ExtensionCommandContext) => ServerState | undefined): Promise<boolean>;
