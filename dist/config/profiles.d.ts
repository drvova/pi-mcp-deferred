import type { McpConfigScope, McpProfileInfo } from './types.js';
export declare function save_mcp_profile(cwd: string, name: string): McpProfileInfo;
export declare function list_mcp_profiles(): McpProfileInfo[];
export declare function load_mcp_profile(cwd: string, name: string, scope?: McpConfigScope): McpProfileInfo;
