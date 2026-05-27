import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { ModalOptions } from './types.js';
export interface ProgressModalUpdate {
    message?: string;
    current?: string;
    completed?: number;
    total?: number;
    line?: string;
}
export interface ProgressModalController {
    signal: AbortSignal;
    update: (update: ProgressModalUpdate) => void;
}
export interface ProgressModalOptions extends ModalOptions {
    message: string;
    max_activity_lines?: number;
    cancel_label?: string;
}
export declare function run_with_progress_modal<T>(ctx: ExtensionCommandContext, options: ProgressModalOptions, task: (controller: ProgressModalController) => Promise<T>): Promise<T | undefined>;
