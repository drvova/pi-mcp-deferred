import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
export function project_mcp_config_path(cwd) {
    return join(cwd, 'mcp.json');
}
export function project_mcp_policy_path(cwd) {
    return join(cwd, '.pi', 'mcp-policy.json');
}
export function global_mcp_config_path() {
    return join(getAgentDir(), 'mcp.json');
}
export function global_mcp_policy_path() {
    return join(getAgentDir(), 'mcp-policy.json');
}
export function mcp_backups_dir() {
    return join(getAgentDir(), 'mcp-backups');
}
export function mcp_profiles_dir() {
    return join(getAgentDir(), 'mcp-profiles');
}
export function timestamp_for_filename(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}
export function safe_profile_name(name) {
    const normalized = name.trim();
    if (!/^[\w-]+$/.test(normalized)) {
        throw new Error('Profile name must use only letters, numbers, underscores, and hyphens');
    }
    return normalized;
}
//# sourceMappingURL=paths.js.map