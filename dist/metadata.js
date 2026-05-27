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
 * Build a compact/deferred schema from a full MCP tool inputSchema.
 * Keeps property names, types, required, and enum values.
 * Strips descriptions, nested object properties, array items, defaults, examples.
 * This saves ~60-80% tokens vs full schema while giving the LLM enough
 * to generate valid function calls.
 */
function compact_schema(schema) {
    if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
    const result = { type: 'object' };
    const props = schema.properties;
    if (props && typeof props === 'object') {
        const compact_props = {};
        for (const [name, def] of Object.entries(props)) {
            compact_props[name] = compact_property(def);
        }
        result.properties = compact_props;
    }
    else {
        result.properties = {};
    }
    if (Array.isArray(schema.required) && schema.required.length > 0) {
        result.required = schema.required;
    }
    return result;
}
/**
 * Compact a single property definition — keep type + enum only.
 */
function compact_property(def) {
    if (!def || typeof def !== 'object') return {};
    if (Array.isArray(def)) return { type: 'array' };
    const compact = {};
    if (def.type) compact.type = def.type;
    if (Array.isArray(def.enum) && def.enum.length <= 20) compact.enum = def.enum;
    if (def.type === 'object' && def.properties) {
        // Recurse one level for nested objects — keeps param names visible
        const nested = {};
        for (const [k, v] of Object.entries(def.properties)) {
            nested[k] = compact_property(v);
        }
        compact.properties = nested;
        if (Array.isArray(def.required) && def.required.length > 0) {
            compact.required = def.required;
        }
    }
    if (def.type === 'array' && def.items) {
        compact.items = compact_property(def.items);
    }
    if (def.anyOf || def.oneOf) {
        compact[def.anyOf ? 'anyOf' : 'oneOf'] = (def.anyOf || def.oneOf).map(compact_property);
    }
    return compact;
}
/**
 * Create a stub tool registration — compact schema (property names + types only)
 * plus first-sentence description. Saves ~60-80% tokens vs full schema while
 * keeping enough structure for the LLM to generate valid function calls.
 * On first execute, auto-promotes the server to load full schemas with descriptions.
 */
export function create_stub_tool_metadata(server_name, tool_name, description, input_schema) {
    return {
        label: `${server_name}: ${tool_name}`,
        description: first_sentence(description) || tool_name,
        parameters: compact_schema(input_schema),
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