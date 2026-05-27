import { type Component } from '@earendil-works/pi-tui';
import type { BorderCharacters } from './layout.js';
import type { ModalStyle, ModalTheme } from './types.js';
export declare function pad_to_width(line: string, width: number): string;
export declare function render_border_line(chars: Pick<BorderCharacters, 'top_left' | 'top' | 'top_right'>, width: number, color: (text: string) => string): string;
export declare function render_bottom_border_line(chars: Pick<BorderCharacters, 'bottom_left' | 'bottom' | 'bottom_right'>, width: number, color: (text: string) => string): string;
export declare function render_framed_modal(content: Component, width: number, style: ModalStyle | undefined, theme: ModalTheme): string[];
