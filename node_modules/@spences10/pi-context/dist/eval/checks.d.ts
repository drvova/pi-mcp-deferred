import { ContextStore } from '../store.js';
import type { EvalCaseResult, SeededSource } from './types.js';
export declare function run_search_evals(store: ContextStore, seeded: Map<string, SeededSource>, results: EvalCaseResult[]): void;
export declare function run_retrieval_evals(store: ContextStore, seeded: Map<string, SeededSource>, results: EvalCaseResult[]): void;
export declare function run_lifecycle_evals(store: ContextStore, seeded: Map<string, SeededSource>, results: EvalCaseResult[]): void;
export declare function run_capture_evals(results: EvalCaseResult[]): void;
export declare function run_retention_evals(store: ContextStore, results: EvalCaseResult[]): void;
export declare function run_cost_evals(store: ContextStore, seeded: Map<string, SeededSource>, results: EvalCaseResult[]): void;
export declare function run_dedupe_evals(results: EvalCaseResult[]): void;
