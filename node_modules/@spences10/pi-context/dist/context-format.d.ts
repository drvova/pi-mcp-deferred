import { type ContextChunk, type ContextChunkSummary, type ContextListResult, type ContextPurgeDetails, type ContextSearchResult, type ContextStats } from './store.js';
export declare function format_search_results(results: ContextSearchResult[]): string;
export declare function format_get_result(source_id: string, chunk_id: string | undefined, chunks: ContextChunk[], summary: ContextChunkSummary | null): string;
export declare function format_list_results(results: ContextListResult[], options?: {
    audience?: 'tool' | 'tui';
}): string;
export declare function format_purge_details(details: ContextPurgeDetails): string;
export declare function format_stats(stats: ContextStats, options?: {
    audience?: 'tool' | 'tui';
    title?: boolean;
}): string;
export declare function format_timestamp(timestamp: number | null): string;
export declare function format_days(days: number | null): string;
export declare function format_max_mb(max_mb: number | null): string;
export declare function format_kib(bytes: number): string;
export declare function format_output_limit(bytes: number, lines: number): string;
export declare function format_context_settings_status(stats: ContextStats, options?: {
    audience?: 'tool' | 'tui';
    title?: boolean;
}): string;
