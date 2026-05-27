import type { EvalCaseResult, EvalReport } from './types.js';
export declare function build_sections(results: EvalCaseResult[]): EvalReport['sections'];
export declare function format_report(report: EvalReport): string;
