import type { LoadMcpConfigOptions, McpProjectConfigInfo, McpServerConfig } from './config/types.js';
export { create_mcp_config_backup, list_mcp_config_backups, restore_mcp_config_backup, } from './config/backups.js';
export { list_mcp_profiles, load_mcp_profile, save_mcp_profile, } from './config/profiles.js';
export type { LoadMcpConfigOptions, McpBackupInfo, McpConfigScope, McpProfileInfo, McpProjectConfigInfo, } from './config/types.js';
export declare function get_project_mcp_config_info(cwd: string): McpProjectConfigInfo | undefined;
export declare function load_mcp_config(cwd: string, options?: LoadMcpConfigOptions): McpServerConfig[];
export declare function set_mcp_server_enabled(cwd: string, name: string, enabled: boolean): boolean;
