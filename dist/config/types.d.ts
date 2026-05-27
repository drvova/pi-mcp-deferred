import type { McpHttpServerConfig, McpServerConfig, McpStdioServerConfig } from '../client.js';
export type { McpHttpServerConfig, McpServerConfig, McpStdioServerConfig, };
export interface RawMcpConfigFile {
    mcpServers: Record<string, RawMcpServerEntry>;
}
export interface RawMcpPolicyFile {
    servers?: Record<string, RawMcpPolicyEntry>;
}
export interface RawMcpPolicyEntry {
    activateWhen?: {
        githubOrg?: unknown;
        githubRepo?: unknown;
        cwdPrefix?: unknown;
    };
}
export interface StoredMcpConfigFile extends RawMcpConfigFile {
    [key: string]: unknown;
}
export type McpConfigScope = 'global' | 'project';
export interface McpBackupInfo {
    filename: string;
    path: string;
    created_at: string;
    global_server_count: number;
    project_server_count: number;
}
export interface McpProfileInfo {
    name: string;
    path: string;
    server_count: number;
    created_at?: string;
}
export interface McpBackupFile {
    version: 1;
    created_at: string;
    cwd: string;
    global: {
        exists: boolean;
        config: StoredMcpConfigFile;
    };
    project: {
        exists: boolean;
        config: StoredMcpConfigFile;
    };
}
export interface McpProfileFile {
    version: 1;
    created_at: string;
    mcpServers: Record<string, RawMcpServerEntry>;
}
export interface LoadMcpConfigOptions {
    include_project?: boolean;
    project_metadata_trusted?: boolean;
}
export interface McpProjectConfigInfo {
    path: string;
    hash: string;
    servers: Array<{
        name: string;
        summary: string;
    }>;
}
export type RawMcpServerEntry = {
    type?: unknown;
    command?: unknown;
    args?: unknown;
    env?: unknown;
    url?: unknown;
    headers?: unknown;
    disabled?: unknown;
    enabled?: unknown;
};
