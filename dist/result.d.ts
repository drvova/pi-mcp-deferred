export declare const MCP_RESULT_MAX_BYTES: number;
export declare const MCP_RESULT_MAX_LINES = 2000;
export interface McpResultTruncationDetails {
    truncated: boolean;
    bytes: number;
    lines: number;
    max_bytes: number;
    max_lines: number;
    preview_bytes?: number;
    preview_lines?: number;
    full_output_path?: string;
}
export declare function format_mcp_tool_result(result: unknown, options?: {
    tool_name?: string;
    input_summary?: string | null;
}): {
    text: string;
    details: McpResultTruncationDetails;
};
export declare function stringify_mcp_tool_result(result: unknown): string;
export declare function truncate_mcp_tool_output(text: string, options?: {
    max_bytes?: number;
    max_lines?: number;
    tmp_dir?: string;
    tool_name?: string;
    input_summary?: string | null;
}): {
    text: string;
    details: McpResultTruncationDetails;
};
