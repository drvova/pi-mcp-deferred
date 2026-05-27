import { create_child_process_env as create_shared_child_process_env } from '@spences10/pi-child-env';
export function create_child_process_env(explicit_env = {}, source_env = process.env) {
    return create_shared_child_process_env({
        profile: 'mcp',
        explicit_env,
        source_env,
    });
}
//# sourceMappingURL=env.js.map