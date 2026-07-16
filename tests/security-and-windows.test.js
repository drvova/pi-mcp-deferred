import { afterEach, describe, expect, it } from 'vitest';
import { parse_server } from '../dist/config/server-parser.js';
import { McpClient } from '../dist/client.js';
import { create_child_process_env } from '../dist/env.js';
import { run_interactive_login, set_browser_opener } from '../dist/oauth.js';

afterEach(() => {
    set_browser_opener(undefined);
});

describe('OAuth browser URL handling', () => {
    it('preserves OAuth query parameters before opening the browser', async () => {
        let opened;
        set_browser_opener((url) => {
            opened = new URL(url);
            const redirect = new URL(opened.searchParams.get('redirect_uri'));
            redirect.searchParams.set('error', 'access_denied');
            redirect.searchParams.set('state', opened.searchParams.get('state'));
            void fetch(redirect);
        });

        await expect(run_interactive_login({
            name: 'query-test',
            transport: 'http',
            url: 'http://127.0.0.1:8000/mcp',
            oauth: {
                client_id: 'test-client',
                authorization_endpoint: 'https://auth.example.test/authorize?one=1&two=2',
                token_endpoint: 'https://auth.example.test/token',
            },
        }, undefined, { hasUI: false })).rejects.toThrow('access_denied');

        expect(opened.protocol).toBe('https:');
        expect(opened.searchParams.get('one')).toBe('1');
        expect(opened.searchParams.get('two')).toBe('2');
        expect(opened.searchParams.get('response_type')).toBe('code');
    });
});

describe('Windows MCP process environment', () => {
    it('preserves explicit environment values on every platform', () => {
        const env = create_child_process_env({ TEST_MCP_VALUE: 'present' });
        expect(env.TEST_MCP_VALUE).toBe('present');
    });

    it('preserves Windows profile variables when running on Windows', () => {
        const source = {
            APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
            USERPROFILE: 'C:\\Users\\test',
            LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
            ComSpec: 'C:\\Windows\\System32\\cmd.exe',
            SystemRoot: 'C:\\Windows',
        };
        const env = create_child_process_env({}, source);
        if (process.platform === 'win32') {
            expect(env).toMatchObject(source);
        }
        else {
            expect(env.APPDATA).toBeUndefined();
        }
    });
});

describe('Windows-compatible stdio configuration', () => {
    it('runs an npx command shim without shell ENOENT on Windows', async () => {
        if (process.platform !== 'win32')
            return;
        const client = new McpClient({
            name: 'npx-test',
            transport: 'stdio',
            command: 'npx',
            args: ['--version'],
            request_timeout_ms: 1000,
        });
        try {
            await expect(client.connect()).rejects.toThrow(/exited before responding|timed out/);
        }
        finally {
            await client.disconnect();
        }
    });

    it('preserves a configured working directory', () => {
        expect(parse_server('local', {
            command: 'python',
            cwd: 'C:\\Users\\test\\project',
        }).cwd).toBe('C:\\Users\\test\\project');
    });
});
