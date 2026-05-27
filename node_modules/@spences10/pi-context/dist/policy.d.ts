import type { ContextRetentionPolicy } from './types.js';
export declare const DEFAULT_CONTEXT_RETENTION_DAYS: number;
export declare function parse_context_retention_policy(env?: NodeJS.ProcessEnv): ContextRetentionPolicy;
