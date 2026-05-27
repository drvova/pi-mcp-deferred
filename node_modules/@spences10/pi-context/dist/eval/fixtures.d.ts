import type { ContextStore } from '../store.js';
import type { SeededSource } from './types.js';
export declare const PROJECT = "/tmp/pi-context-eval-project";
export declare const SESSION = "/tmp/pi-context-eval-session.jsonl";
export declare function make_noise_lines(count: number, prefix: string): string;
export declare function source_texts(): Record<string, {
    tool_name: string;
    text: string;
}>;
export declare function seed(store: ContextStore): Map<string, SeededSource>;
export declare function result_bytes(values: Array<{
    content: string;
}>): number;
