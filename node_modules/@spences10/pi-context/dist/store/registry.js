import { homedir } from 'node:os';
import { join } from 'node:path';
let global_options = {};
let global_enabled = false;
let global_store = null;
export function default_context_db_path() {
    if (process.env.MY_PI_CONTEXT_DB)
        return process.env.MY_PI_CONTEXT_DB;
    const agent_dir = process.env.PI_CODING_AGENT_DIR ??
        join(process.env.HOME ?? process.env.USERPROFILE ?? homedir(), '.pi', 'agent');
    return join(agent_dir, 'context.db');
}
export function set_context_sidecar_enabled(enabled, options = {}) {
    global_enabled = enabled;
    if (!enabled) {
        global_options = {};
        global_store = null;
        return;
    }
    global_options = { ...global_options, ...options };
}
export function is_context_sidecar_enabled() {
    return global_enabled;
}
export function get_context_store(StoreCtor, options = {}) {
    const merged = { ...global_options, ...options };
    const db_path = merged.db_path ?? default_context_db_path();
    if (!global_store || global_store.db_path !== db_path) {
        global_store = new StoreCtor({ ...merged, db_path });
    }
    else {
        global_store.configure(merged);
    }
    return global_store;
}
export function maybe_store_context_output(StoreCtor, input, options = {}) {
    if (!global_enabled)
        return null;
    return get_context_store(StoreCtor, options).store(input);
}
//# sourceMappingURL=registry.js.map