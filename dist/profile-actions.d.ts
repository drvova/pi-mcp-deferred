import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { type McpConfigScope } from './config.js';
export declare function load_profile(ctx: ExtensionCommandContext, name: string, scope: McpConfigScope): Promise<boolean>;
export declare function show_mcp_profile_actions(ctx: ExtensionCommandContext, name: string): Promise<boolean>;
export declare function handle_mcp_profile(ctx: ExtensionCommandContext, args: string[]): Promise<boolean>;
