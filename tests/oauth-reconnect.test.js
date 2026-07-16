import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agent_dir = mkdtempSync(join(tmpdir(), 'pi-mcp-agent-'));
const project_dir = mkdtempSync(join(tmpdir(), 'pi-mcp-project-'));
const auth_headers = [];
let mcp_server;
let mcp_server_port;
let events;
let tools;
let commands;
let ctx;
let previous_agent_dir;
let previous_project_config;

function write_token(access_token) {
    writeFileSync(join(agent_dir, 'oauth-tokens.json'), JSON.stringify({
        demo: { access_token, expires_at: Date.now() + 300_000 },
    }));
}

describe('OAuth client reconnection', () => {
    beforeAll(async () => {
        previous_agent_dir = process.env.PI_CODING_AGENT_DIR;
        previous_project_config = process.env.MY_PI_MCP_PROJECT_CONFIG;
        process.env.PI_CODING_AGENT_DIR = agent_dir;
        delete process.env.MY_PI_MCP_PROJECT_CONFIG;

        mcp_server = createServer(async (req, res) => {
            const chunks = [];
            for await (const chunk of req)
                chunks.push(chunk);
            const body = chunks.length
                ? JSON.parse(Buffer.concat(chunks).toString())
                : undefined;
            if (req.headers.authorization)
                auth_headers.push(req.headers.authorization);
            if (req.method === 'DELETE') {
                res.writeHead(204).end();
                return;
            }
            if (!body?.id) {
                res.writeHead(204).end();
                return;
            }
            const result = body.method === 'tools/list'
                ? { tools: [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object' } }] }
                : body.method === 'initialize'
                    ? { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'test', version: '1' } }
                    : { content: [{ type: 'text', text: 'ok' }] };
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
        });
        await new Promise((resolve) => mcp_server.listen(0, '127.0.0.1', resolve));
        mcp_server_port = mcp_server.address().port;
        writeFileSync(join(agent_dir, 'mcp.json'), JSON.stringify({ mcpServers: {
            demo: {
                type: 'http',
                url: `http://127.0.0.1:${mcp_server_port}/mcp`,
                oauth: true,
                catalog: false,
                idle_timeout_ms: 0,
            },
        } }));
        write_token('A');

        const { default: mcp } = await import('../dist/index.js');
        events = new Map();
        tools = new Map();
        commands = new Map();
        const pi = {
            on(name, handler) {
                events.set(name, handler);
            },
            registerTool(tool) {
                tools.set(tool.name, tool);
            },
            registerCommand(name, command) {
                commands.set(name, command);
            },
            refreshTools() {},
            getActiveTools() {
                return [...tools.keys()];
            },
            setActiveTools() {},
        };
        await mcp(pi);
        ctx = {
            cwd: project_dir,
            hasUI: false,
            ui: { notify() {}, setStatus() {} },
        };
        await events.get('session_start')({}, ctx);
        await commands.get('mcp').handler('connect demo', ctx);
    });

    afterAll(async () => {
        if (events && ctx)
            await events.get('session_shutdown')?.({}, ctx);
        if (mcp_server?.listening)
            await new Promise((resolve) => mcp_server.close(resolve));
        rmSync(agent_dir, { recursive: true, force: true });
        rmSync(project_dir, { recursive: true, force: true });
        if (previous_agent_dir === undefined)
            delete process.env.PI_CODING_AGENT_DIR;
        else
            process.env.PI_CODING_AGENT_DIR = previous_agent_dir;
        if (previous_project_config === undefined)
            delete process.env.MY_PI_MCP_PROJECT_CONFIG;
        else
            process.env.MY_PI_MCP_PROJECT_CONFIG = previous_project_config;
    });

    it('reconnects an active client after the stored access token changes', async () => {
        const tool = tools.get('mcp__demo__echo');
        expect(tool).toBeDefined();
        await tool.execute('first', {});
        write_token('B');
        await tool.execute('second', {});

        const first_new_token = auth_headers.indexOf('Bearer B');
        expect(first_new_token).toBeGreaterThan(0);
        expect(auth_headers.slice(first_new_token).every((value) => value === 'Bearer B'))
            .toBe(true);
    });
});
