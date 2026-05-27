function is_string_record(value, label, name) {
    if (value === undefined)
        return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid MCP server "${name}": ${label} must be an object of string values`);
    }
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string') {
            throw new Error(`Invalid MCP server "${name}": ${label}.${key} must be a string`);
        }
    }
    return true;
}
export function parse_server(name, entry, metadata_trusted = true) {
    const type = typeof entry.type === 'string'
        ? entry.type.trim().toLowerCase()
        : '';
    const disabled = typeof entry.disabled === 'boolean'
        ? entry.disabled
        : typeof entry.enabled === 'boolean'
            ? !entry.enabled
            : undefined;
    const deferred = typeof entry.deferred === 'boolean'
        ? entry.deferred
        : undefined;
    if (type && !['stdio', 'http', 'streamable-http'].includes(type)) {
        throw new Error(`Invalid MCP server "${name}": unsupported transport type "${type}"`);
    }
    if (type === 'http' ||
        type === 'streamable-http' ||
        entry.url !== undefined) {
        if (typeof entry.url !== 'string' || !entry.url.trim()) {
            throw new Error(`Invalid MCP server "${name}": http transport requires a url`);
        }
        is_string_record(entry.headers, 'headers', name);
        const headers = entry.headers;
        const config = {
            name,
            transport: 'http',
            url: entry.url.trim(),
            ...(headers ? { headers } : {}),
            ...(disabled !== undefined ? { disabled } : {}),
            ...(deferred !== undefined ? { deferred } : {}),
            ...(metadata_trusted
                ? {}
                : { metadata_trusted: false }),
        };
        return config;
    }
    if (typeof entry.command !== 'string' || !entry.command.trim()) {
        throw new Error(`Invalid MCP server "${name}": stdio transport requires a command`);
    }
    if (entry.args !== undefined &&
        (!Array.isArray(entry.args) ||
            entry.args.some((value) => typeof value !== 'string'))) {
        throw new Error(`Invalid MCP server "${name}": args must be an array of strings`);
    }
    is_string_record(entry.env, 'env', name);
    const args = entry.args;
    const env = entry.env;
    const config = {
        name,
        transport: 'stdio',
        command: entry.command.trim(),
        ...(args ? { args } : {}),
        ...(env ? { env } : {}),
        ...(disabled !== undefined ? { disabled } : {}),
        ...(deferred !== undefined ? { deferred } : {}),
        ...(metadata_trusted ? {} : { metadata_trusted: false }),
    };
    return config;
}
export function summarize_server_entry(server) {
    if (typeof server.url === 'string' && server.url.trim()) {
        return `http ${server.url.trim()}`;
    }
    if (typeof server.command === 'string' && server.command.trim()) {
        const args = Array.isArray(server.args)
            ? server.args.filter((arg) => typeof arg === 'string')
            : [];
        return ['stdio', server.command.trim(), ...args].join(' ');
    }
    return 'invalid server entry';
}
//# sourceMappingURL=server-parser.js.map