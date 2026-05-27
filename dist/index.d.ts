import { type BeforeAgentStartEvent, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
export declare function should_wait_for_mcp_connections(event: Pick<BeforeAgentStartEvent, 'systemPromptOptions'>): boolean;
export default function mcp(pi: ExtensionAPI): Promise<void>;
