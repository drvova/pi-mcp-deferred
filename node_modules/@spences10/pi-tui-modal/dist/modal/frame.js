import { truncateToWidth, visibleWidth, } from '@earendil-works/pi-tui';
import { border_characters, default_modal_style } from './layout.js';
export function pad_to_width(line, width) {
    return line + ' '.repeat(Math.max(0, width - visibleWidth(line)));
}
export function render_border_line(chars, width, color) {
    if (width <= 1)
        return color(chars.top_left);
    return color(chars.top_left +
        chars.top.repeat(Math.max(0, width - 2)) +
        chars.top_right);
}
export function render_bottom_border_line(chars, width, color) {
    if (width <= 1)
        return color(chars.bottom_left);
    return color(chars.bottom_left +
        chars.bottom.repeat(Math.max(0, width - 2)) +
        chars.bottom_right);
}
export function render_framed_modal(content, width, style, theme) {
    const resolved_style = { ...default_modal_style, ...style };
    const color = (text) => theme.fg(resolved_style.border_color, text);
    if (resolved_style.border === 'none') {
        return content.render(width);
    }
    if (resolved_style.border === 'line') {
        const line = color('─'.repeat(Math.max(1, width)));
        return [line, ...content.render(width), line];
    }
    const chars = border_characters[resolved_style.border];
    const inner_width = Math.max(1, width - 2);
    const body_lines = content.render(inner_width).map((line) => {
        const padded = pad_to_width(truncateToWidth(line, inner_width, '', true), inner_width);
        return `${color(chars.left)}${padded}${color(chars.right)}`;
    });
    return [
        render_border_line(chars, width, color),
        ...body_lines,
        render_bottom_border_line(chars, width, color),
    ];
}
//# sourceMappingURL=frame.js.map