import { Key, matchesKey, truncateToWidth, } from '@earendil-works/pi-tui';
import { show_modal } from './show.js';
class ProgressModalBody {
    tui;
    theme;
    state;
    on_cancel;
    max_activity_lines;
    frame = 0;
    frames = [
        '⠋',
        '⠙',
        '⠹',
        '⠸',
        '⠼',
        '⠴',
        '⠦',
        '⠧',
        '⠇',
        '⠏',
    ];
    interval;
    constructor(tui, theme, state, on_cancel, max_activity_lines) {
        this.tui = tui;
        this.theme = theme;
        this.state = state;
        this.on_cancel = on_cancel;
        this.max_activity_lines = max_activity_lines;
        this.interval = setInterval(() => {
            this.frame = (this.frame + 1) % this.frames.length;
            this.tui.requestRender();
        }, 120);
    }
    render(width) {
        const spinner = this.theme.fg('accent', this.frames[this.frame] ?? '•');
        const count = this.state.total !== undefined &&
            this.state.completed !== undefined
            ? this.theme.fg('dim', ` ${this.state.completed}/${this.state.total}`)
            : '';
        const lines = [`${spinner} ${this.state.message}${count}`];
        if (this.state.current) {
            lines.push(this.theme.fg('muted', `Current: ${this.state.current}`));
        }
        if (this.state.lines.length > 0) {
            lines.push('', this.theme.fg('dim', 'Recent activity'));
            lines.push(...this.state.lines.slice(-this.max_activity_lines));
        }
        return lines.map((line) => truncateToWidth(line, width));
    }
    handleInput(data) {
        if (matchesKey(data, Key.escape))
            this.on_cancel();
    }
    invalidate() { }
    dispose() {
        clearInterval(this.interval);
    }
}
export async function run_with_progress_modal(ctx, options, task) {
    const result = await show_modal(ctx, {
        ...options,
        footer: options.footer ?? `${options.cancel_label ?? 'esc'} cancel`,
        overlay_options: {
            width: '70%',
            minWidth: 50,
            maxHeight: '70%',
            ...options.overlay_options,
        },
    }, ({ done }, theme, _layout, tui) => {
        const abort_controller = new AbortController();
        const state = {
            message: options.message,
            lines: [],
            cancelled: false,
        };
        const update = (update) => {
            if (update.message !== undefined)
                state.message = update.message;
            if (update.current !== undefined)
                state.current = update.current;
            if (update.completed !== undefined)
                state.completed = update.completed;
            if (update.total !== undefined)
                state.total = update.total;
            if (update.line)
                state.lines.push(update.line);
            tui.requestRender();
        };
        const body = new ProgressModalBody(tui, theme, state, () => {
            if (state.cancelled)
                return;
            state.cancelled = true;
            state.message = 'Cancelling...';
            abort_controller.abort();
            tui.requestRender();
        }, options.max_activity_lines ?? 8);
        void task({ signal: abort_controller.signal, update })
            .then((value) => {
            done(state.cancelled
                ? { status: 'cancelled' }
                : { status: 'success', value });
        })
            .catch((error) => {
            if (state.cancelled || abort_controller.signal.aborted) {
                done({ status: 'cancelled' });
                return;
            }
            done({ status: 'error', error });
        });
        return body;
    });
    if (result.status === 'cancelled') {
        ctx.ui.notify('Cancelled', 'info');
        return undefined;
    }
    if (result.status === 'error')
        throw result.error;
    return result.value;
}
//# sourceMappingURL=progress.js.map