import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, } from 'node:fs';
import { dirname, join } from 'node:path';
export function read_config_file(path) {
    if (!existsSync(path))
        return { mcpServers: {} };
    const raw = readFileSync(path, 'utf-8');
    const config = JSON.parse(raw);
    return {
        ...config,
        mcpServers: config.mcpServers || {},
    };
}
export function write_config_file(path, config) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp_path = join(dirname(path), `.${Date.now()}.tmp`);
    writeFileSync(tmp_path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    renameSync(tmp_path, path);
}
export function read_config(path) {
    return read_config_file(path).mcpServers;
}
//# sourceMappingURL=read-write.js.map