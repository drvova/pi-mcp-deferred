interface McpServerTrustMetadata {
    /**
     * False when the server came from a project mcp.json that was allowed for
     * this session but not trusted. Tool descriptions and schema prose from
     * such servers must not be exposed to the model.
     */
    metadata_trusted?: false;
    /** Disabled in MCP config. Kept visible so `/mcp` can re-enable it. */
    disabled?: boolean;
    /** Request timeout in milliseconds. Primarily used by tests. */
    request_timeout_ms?: number;
    /** Disconnect an idle connected server after this many milliseconds. */
    idle_timeout_ms?: number;
}
export interface McpStdioServerConfig extends McpServerTrustMetadata {
    name: string;
    transport: 'stdio';
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
}
export interface McpOAuthOptions {
    authorization_endpoint?: string;
    token_endpoint?: string;
    registration_endpoint?: string;
    client_id?: string;
    client_secret?: string;
    scopes?: string | string[];
}
export interface McpHttpServerConfig extends McpServerTrustMetadata {
    name: string;
    transport: 'http';
    url: string;
    headers?: Record<string, string>;
    /**
     * Enable OAuth 2.0 (authorization code + PKCE) for this server. `true`
     * auto-discovers endpoints and dynamically registers a client; an object
     * pins specific endpoints / a pre-registered client_id.
     */
    oauth?: boolean | McpOAuthOptions;
}
export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;
export interface McpToolInfo {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}
export declare class McpClient {
    #private;
    constructor(config: McpServerConfig);
    connect(): Promise<void>;
    listTools(): Promise<McpToolInfo[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    disconnect(): Promise<void>;
}
export {};
