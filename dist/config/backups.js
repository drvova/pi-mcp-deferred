import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, } from 'node:fs';
import { join } from 'node:path';
import { global_mcp_config_path, mcp_backups_dir, project_mcp_config_path, timestamp_for_filename, } from './paths.js';
import { read_config_file, write_config_file } from './read-write.js';
function parse_created_at_from_backup_filename(filename) {
    return filename
        .replace(/^mcp-config-/, '')
        .replace(/\.json$/, '')
        .replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');
}
function create_backup_file(cwd) {
    const global_path = global_mcp_config_path();
    const project_path = project_mcp_config_path(cwd);
    return {
        version: 1,
        created_at: new Date().toISOString(),
        cwd,
        global: {
            exists: existsSync(global_path),
            config: read_config_file(global_path),
        },
        project: {
            exists: existsSync(project_path),
            config: read_config_file(project_path),
        },
    };
}
function to_backup_info(path, backup) {
    return {
        filename: path.split('/').pop() ?? path,
        path,
        created_at: backup.created_at,
        global_server_count: Object.keys(backup.global.config.mcpServers)
            .length,
        project_server_count: Object.keys(backup.project.config.mcpServers).length,
    };
}
export function create_mcp_config_backup(cwd) {
    const backup = create_backup_file(cwd);
    const backups_dir = mcp_backups_dir();
    mkdirSync(backups_dir, { recursive: true });
    const path = join(backups_dir, `mcp-config-${timestamp_for_filename(new Date(backup.created_at))}.json`);
    write_config_file(path, backup);
    return to_backup_info(path, backup);
}
export function list_mcp_config_backups() {
    const backups_dir = mcp_backups_dir();
    if (!existsSync(backups_dir))
        return [];
    return readdirSync(backups_dir)
        .filter((file) => file.startsWith('mcp-config-') && file.endsWith('.json'))
        .map((filename) => {
        const path = join(backups_dir, filename);
        try {
            const backup = JSON.parse(readFileSync(path, 'utf-8'));
            return to_backup_info(path, backup);
        }
        catch {
            return {
                filename,
                path,
                created_at: parse_created_at_from_backup_filename(filename),
                global_server_count: 0,
                project_server_count: 0,
            };
        }
    })
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function restore_mcp_config_backup(cwd, path) {
    const backup = JSON.parse(readFileSync(path, 'utf-8'));
    if (backup.version !== 1) {
        throw new Error('Unsupported MCP backup version');
    }
    const global_path = global_mcp_config_path();
    const project_path = project_mcp_config_path(cwd);
    if (backup.global.exists)
        write_config_file(global_path, backup.global.config);
    else
        rmSync(global_path, { force: true });
    if (backup.project.exists)
        write_config_file(project_path, backup.project.config);
    else
        rmSync(project_path, { force: true });
    return to_backup_info(path, backup);
}
//# sourceMappingURL=backups.js.map