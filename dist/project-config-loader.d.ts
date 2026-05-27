import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
export interface ProjectMcpConfigLoadDecision {
    include_project: boolean;
    metadata_trusted: boolean;
}
export declare function get_project_mcp_config_load_decision(cwd: string, ctx?: ExtensionContext): Promise<ProjectMcpConfigLoadDecision>;
