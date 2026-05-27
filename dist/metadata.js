const DEFAULT_INPUT_SCHEMA = {
    type: 'object',
    properties: {},
};
const UNTRUSTED_SCHEMA_PROSE_KEYS = new Set([
    '$comment',
    'default',
    'description',
    'enumDescriptions',
    'errorMessage',
    'examples',
    'markdownDescription',
    'title',
]);
export function is_mcp_metadata_trusted(config) {
    return config.metadata_trusted !== false;
}
export function sanitize_mcp_input_schema(schema) {
    const sanitized = sanitize_schema_value(schema ?? DEFAULT_INPUT_SCHEMA);
    if (!sanitized ||
        typeof sanitized !== 'object' ||
        Array.isArray(sanitized)) {
        return { ...DEFAULT_INPUT_SCHEMA };
    }
    return sanitized;
}
export function format_untrusted_mcp_description(server_name, tool_name) {
    return `Untrusted MCP tool "${tool_name}" from server "${server_name}". Rich MCP metadata suppressed until this server is trusted.`;
}
export function create_mcp_tool_registration_metadata(config, tool) {
    if (is_mcp_metadata_trusted(config)) {
        return {
            label: `${config.name}: ${tool.name}`,
            description: tool.description || tool.name,
            parameters: tool.inputSchema || { ...DEFAULT_INPUT_SCHEMA },
        };
    }
    return {
        label: `${config.name}: ${tool.name} (untrusted metadata)`,
        description: format_untrusted_mcp_description(config.name, tool.name),
        parameters: sanitize_mcp_input_schema(tool.inputSchema),
    };
}
/**
 * Extract the first sentence from a description string.
 * Falls back to the full description if no sentence boundary found.
 */
function first_sentence(text) {
    if (!text) return '';
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : text.slice(0, 120);
}
/**
 * Create a stub tool registration — compact description + empty params.
 * The stub defers full schema loading until the tool is actually called,
 * saving context tokens when many MCP tools are configured but few used.
 */
export function create_stub_tool_metadata(server_name, tool_name, description) {
    return {
        label: `${server_name}: ${tool_name}`,
        description: `${first_sentence(description)} [Schema deferred — call to load full schema]`,
        parameters: { ...DEFAULT_INPUT_SCHEMA },
    };
}
function sanitize_schema_value(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => sanitize_schema_value(entry));
    }
    if (!value || typeof value !== 'object')
        return value;
    const sanitized = {};
    for (const [key, entry] of Object.entries(value)) {
        if (UNTRUSTED_SCHEMA_PROSE_KEYS.has(key))
            continue;
        sanitized[key] = sanitize_schema_value(entry);
    }
    return sanitized;
}
//# sourceMappingURL=metadata.js.map