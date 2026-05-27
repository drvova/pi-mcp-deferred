import type { McpServerConfig, RawMcpServerEntry } from './types.js';
export declare function parse_server(name: string, entry: RawMcpServerEntry, metadata_trusted?: boolean): McpServerConfig;
export declare function summarize_server_entry(server: RawMcpServerEntry): string;
