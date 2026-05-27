import type { EvalReport } from './types.js';
export declare function run_context_eval(): EvalReport;
export declare function run_context_eval_cli(args?: string[]): Promise<void>;
export type { EvalCaseResult, EvalCategory, EvalReport, } from './types.js';
