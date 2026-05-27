import { existsSync, mkdirSync, readFileSync, readdirSync, } from 'node:fs';
import { join } from 'node:path';
import { global_mcp_config_path, mcp_profiles_dir, project_mcp_config_path, safe_profile_name, } from './paths.js';
import { read_config, write_config_file } from './read-write.js';
function merged_mcp_servers(cwd) {
    return {
        ...read_config(global_mcp_config_path()),
        ...read_config(project_mcp_config_path(cwd)),
    };
}
export function save_mcp_profile(cwd, name) {
    const safe_name = safe_profile_name(name);
    const servers = merged_mcp_servers(cwd);
    const server_count = Object.keys(servers).length;
    if (server_count === 0)
        throw new Error('No MCP servers configured to save');
    const profiles_dir = mcp_profiles_dir();
    mkdirSync(profiles_dir, { recursive: true });
    const profile = {
        version: 1,
        created_at: new Date().toISOString(),
        mcpServers: servers,
    };
    const path = join(profiles_dir, `${safe_name}.json`);
    write_config_file(path, profile);
    return {
        name: safe_name,
        path,
        server_count,
        created_at: profile.created_at,
    };
}
export function list_mcp_profiles() {
    const profiles_dir = mcp_profiles_dir();
    if (!existsSync(profiles_dir))
        return [];
    return readdirSync(profiles_dir)
        .filter((file) => file.endsWith('.json'))
        .map((filename) => {
        const path = join(profiles_dir, filename);
        try {
            const profile = JSON.parse(readFileSync(path, 'utf-8'));
            const servers = profile.mcpServers ?? {};
            return {
                name: filename.replace(/\.json$/, ''),
                path,
                server_count: Object.keys(servers).length,
                created_at: profile.created_at,
            };
        }
        catch {
            return {
                name: filename.replace(/\.json$/, ''),
                path,
                server_count: 0,
            };
        }
    })
        .sort((a, b) => a.name.localeCompare(b.name));
}
export function load_mcp_profile(cwd, name, scope = 'global') {
    const safe_name = safe_profile_name(name);
    const path = join(mcp_profiles_dir(), `${safe_name}.json`);
    if (!existsSync(path))
        throw new Error(`MCP profile not found: ${safe_name}`);
    const profile = JSON.parse(readFileSync(path, 'utf-8'));
    const servers = profile.mcpServers ?? {};
    const target_path = scope === 'project'
        ? project_mcp_config_path(cwd)
        : global_mcp_config_path();
    write_config_file(target_path, { mcpServers: servers });
    return {
        name: safe_name,
        path,
        server_count: Object.keys(servers).length,
        created_at: profile.created_at,
    };
}
//# sourceMappingURL=profiles.js.map