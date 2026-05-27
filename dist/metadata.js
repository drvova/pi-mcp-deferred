const DEFAULT_INPUT_SCHEMA = {
    type: 'object',
    properties: {},
};
const STUB_INPUT_SCHEMA = {
    type: 'object',
    properties: {},
    additionalProperties: true,
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
 * Build a compact param hint string from an MCP tool's inputSchema.
 * E.g. "Params: repo_name (string, required), query (string, required), language (string)"
 * Returns empty string if no properties found.
 */
function param_hints(schema) {
    if (!schema || typeof schema !== 'object') return '';
    const props = schema.properties;
    if (!props || typeof props !== 'object') return '';
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const entries = Object.entries(props);
    if (entries.length === 0) return '';
    const parts = entries.map(([name, def]) => {
        const type = def && typeof def === 'object' && def.type ? def.type : 'any';
        const req = required.has(name) ? ', required' : '';
        return `${name} (${type}${req})`;
    });
    return `Params: ${parts.join(', ')}. `;
}
/**
 * Create a stub tool registration — compact description with param hints + empty schema.
 * The stub defers full schema loading until the tool is actually called,
 * saving context tokens when many MCP tools are configured but few used.
 * Param hints in the description let the LLM pass valid params on first call.
 */
export function create_stub_tool_metadata(server_name, tool_name, description, input_schema) {
    const hints = param_hints(input_schema);
    return {
        label: `${server_name}: ${tool_name}`,
        description: `${first_sentence(description)} ${hints}[Deferred — full schema loads on first call]`,
        parameters: { ...STUB_INPUT_SCHEMA },
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