import type { RawMcpPolicyEntry } from './types.js';
export declare function get_github_repos(cwd: string): string[];
export declare function load_mcp_policy(cwd: string): Record<string, RawMcpPolicyEntry>;
export declare function policy_matches(policy: RawMcpPolicyEntry | undefined, cwd: string, github_repos: string[]): boolean;
