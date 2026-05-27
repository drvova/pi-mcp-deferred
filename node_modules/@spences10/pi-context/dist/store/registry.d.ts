import type { ContextStore } from '../store.js';
import type { ContextStoreOptions, StoreContextInput, StoredContextOutput } from '../types.js';
export declare function default_context_db_path(): string;
export declare function set_context_sidecar_enabled(enabled: boolean, options?: ContextStoreOptions): void;
export declare function is_context_sidecar_enabled(): boolean;
export declare function get_context_store(StoreCtor: typeof ContextStore, options?: ContextStoreOptions): ContextStore;
export declare function maybe_store_context_output(StoreCtor: typeof ContextStore, input: StoreContextInput, options?: ContextStoreOptions): StoredContextOutput | null;
