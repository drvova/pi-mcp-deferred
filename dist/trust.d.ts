import { type ProjectTrustSubject } from '@spences10/pi-project-trust';
export declare function default_mcp_trust_store_path(): string;
export declare function create_mcp_project_trust_subject(path: string, hash: string): ProjectTrustSubject;
export declare function is_project_mcp_config_trusted(path: string, hash: string, trust_store_path?: string): boolean;
export declare function trust_project_mcp_config(path: string, hash: string, trust_store_path?: string): void;
