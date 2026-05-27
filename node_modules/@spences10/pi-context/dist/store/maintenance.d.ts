import type { DatabaseSync } from 'node:sqlite';
import type { ContextCleanupResult, ContextPurgeDetails, ContextRetentionPolicy, ContextScopeOptions, ContextStats, ScopedFilter } from '../types.js';
export interface ContextStoreMaintenanceTarget {
    db_path: string;
    db: DatabaseSync;
    scoped_filter(alias: string, options?: ContextScopeOptions): ScopedFilter;
    purge(options?: ContextScopeOptions & {
        older_than_days?: number;
        source_id?: string;
    }): number;
    purge_to_max_stored_bytes(max_bytes: number): number;
}
export declare function context_store_stats(store: ContextStoreMaintenanceTarget, options?: ContextScopeOptions): ContextStats;
export declare function context_store_cleanup(store: ContextStoreMaintenanceTarget, policy?: ContextRetentionPolicy): ContextCleanupResult;
export declare function context_store_purge_to_max_stored_bytes(store: ContextStoreMaintenanceTarget, max_bytes: number): number;
export declare function context_store_purge_with_details(store: ContextStoreMaintenanceTarget, options?: ContextScopeOptions & {
    older_than_days?: number;
    source_id?: string;
}): ContextPurgeDetails;
