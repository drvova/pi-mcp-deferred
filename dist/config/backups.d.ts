import type { McpBackupInfo } from './types.js';
export declare function create_mcp_config_backup(cwd: string): McpBackupInfo;
export declare function list_mcp_config_backups(): McpBackupInfo[];
export declare function restore_mcp_config_backup(cwd: string, path: string): McpBackupInfo;
