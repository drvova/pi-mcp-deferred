import { create_child_process_env as create_shared_child_process_env } from '@spences10/pi-child-env';
export function create_child_process_env(explicit_env = {}, source_env = process.env) {
    // The shared allowlist omits Windows profile variables. Preserve the ones
    // used by Python user installs, shells, and Windows-native CLI tools.
    const windows_env = process.platform === 'win32'
        ? Object.fromEntries(['APPDATA', 'USERPROFILE', 'LOCALAPPDATA', 'ComSpec', 'SystemRoot']
            .filter((key) => typeof source_env[key] === 'string')
            .map((key) => [key, source_env[key]]))
        : {};
    return create_shared_child_process_env({
        profile: 'mcp',
        explicit_env: { ...windows_env, ...explicit_env },
        source_env,
    });
}
//# sourceMappingURL=env.js.map