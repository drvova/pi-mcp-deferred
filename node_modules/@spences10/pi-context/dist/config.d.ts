export type ContextSettingsPreset = 'default' | 'light' | 'balanced' | 'research' | 'archive';
export interface ContextOutputLimits {
    max_bytes: number;
    max_lines: number;
}
export interface ContextSettingsValues {
    retention_days: number | null;
    max_mb: number | null;
    purge_on_shutdown: boolean;
    capture_max_bytes: number;
    capture_max_lines: number;
    mcp_max_bytes: number;
    mcp_max_lines: number;
}
export interface ContextSettingsConfig extends ContextSettingsValues {
    version: 1;
    preset: ContextSettingsPreset | 'custom';
}
export interface ContextSettingsPresetDefinition extends ContextSettingsValues {
    label: string;
    description: string;
}
export declare const DEFAULT_CONTEXT_CAPTURE_MAX_BYTES: number;
export declare const DEFAULT_CONTEXT_CAPTURE_MAX_LINES = 300;
export declare const DEFAULT_CONTEXT_MCP_MAX_BYTES: number;
export declare const DEFAULT_CONTEXT_MCP_MAX_LINES = 2000;
export declare const CONTEXT_SETTINGS_PRESETS: Record<ContextSettingsPreset, ContextSettingsPresetDefinition>;
export declare const DEFAULT_CONTEXT_SETTINGS: ContextSettingsConfig;
export declare function get_context_settings_config_path(): string;
export declare function context_settings_from_preset(preset: ContextSettingsPreset): ContextSettingsConfig;
export declare function load_context_settings_config(): ContextSettingsConfig | null;
export declare function save_context_settings_config(config: ContextSettingsConfig): void;
export declare function get_context_capture_limits(env?: NodeJS.ProcessEnv): ContextOutputLimits;
export declare function get_context_mcp_output_limits(env?: NodeJS.ProcessEnv): ContextOutputLimits;
export declare function normalize_context_settings_config(value: Partial<ContextSettingsConfig>): ContextSettingsConfig;
export declare function is_context_settings_preset(value: unknown): value is ContextSettingsPreset;
