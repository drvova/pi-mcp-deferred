import type { McpServerConfig, McpToolInfo } from './client.js';
export declare function is_mcp_metadata_trusted(config: Pick<McpServerConfig, 'metadata_trusted'>): boolean;
export declare function sanitize_mcp_input_schema(schema: Record<string, unknown> | undefined): Record<string, unknown>;
export declare function format_untrusted_mcp_description(server_name: string, tool_name: string): string;
export declare function create_mcp_tool_registration_metadata(config: McpServerConfig, tool: McpToolInfo): {
    label: string;
    description: string;
    parameters: Record<string, unknown>;
};
