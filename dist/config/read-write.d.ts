import type { RawMcpConfigFile, StoredMcpConfigFile } from './types.js';
export declare function read_config_file(path: string): StoredMcpConfigFile;
export declare function write_config_file(path: string, config: StoredMcpConfigFile): void;
export declare function read_config(path: string): RawMcpConfigFile['mcpServers'];
