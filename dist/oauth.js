import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, } from 'node:fs';
import { dirname, join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
const CLIENT_NAME = 'my-pi';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const CALLBACK_TIMEOUT_MS = 300_000;
function token_store_path() {
    return join(getAgentDir(), 'oauth-tokens.json');
}
function read_token_store() {
    const path = token_store_path();
    if (!existsSync(path))
        return {};
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) ?? {};
    }
    catch {
        return {};
    }
}
export function load_token(name) {
    return read_token_store()[name];
}
export function save_token(name, token) {
    const path = token_store_path();
    const store = read_token_store();
    store[name] = token;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = join(dirname(path), `.oauth-${Date.now()}.tmp`);
    writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, path);
}
function base64url(buffer) {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
function create_pkce() {
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}
export function is_oauth_enabled(config) {
    return config.transport === 'http' && Boolean(config.oauth);
}
function oauth_options(config) {
    return typeof config.oauth === 'object' && config.oauth ? config.oauth : {};
}
export function apply_bearer(config, access_token) {
    return {
        ...config,
        headers: { ...(config.headers ?? {}), Authorization: `Bearer ${access_token}` },
    };
}
async function fetch_json(url, init) {
    const response = await fetch(url, init);
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OAuth request to ${url} failed: ${response.status}${body ? ` ${body.slice(0, 200)}` : ''}`);
    }
    return response.json();
}
async function try_fetch_json(url) {
    try {
        const response = await fetch(url);
        if (!response.ok)
            return undefined;
        return await response.json();
    }
    catch {
        return undefined;
    }
}
// Parse resource_metadata hint from a WWW-Authenticate: Bearer header (RFC 9728).
function parse_resource_metadata_url(www_authenticate) {
    if (!www_authenticate)
        return undefined;
    const match = /resource_metadata="?([^",\s]+)"?/i.exec(www_authenticate);
    return match?.[1];
}
// Resolve authorization/token/registration endpoints via MCP OAuth discovery.
async function discover_endpoints(config, www_authenticate) {
    const opts = oauth_options(config);
    if (opts.authorization_endpoint && opts.token_endpoint) {
        return {
            authorization_endpoint: opts.authorization_endpoint,
            token_endpoint: opts.token_endpoint,
            registration_endpoint: opts.registration_endpoint,
        };
    }
    const server_url = new URL(config.url);
    const origin = server_url.origin;
    // RFC 9728: protected resource metadata points at the authorization server(s).
    let auth_server_origin = origin;
    const resource_meta_url = parse_resource_metadata_url(www_authenticate) ??
        `${origin}/.well-known/oauth-protected-resource`;
    const resource_meta = await try_fetch_json(resource_meta_url);
    const auth_servers = resource_meta?.authorization_servers;
    if (Array.isArray(auth_servers) && typeof auth_servers[0] === 'string') {
        auth_server_origin = new URL(auth_servers[0]).origin;
    }
    // RFC 8414 authorization server metadata, with OIDC fallback.
    const meta = (await try_fetch_json(`${auth_server_origin}/.well-known/oauth-authorization-server`)) ??
        (await try_fetch_json(`${auth_server_origin}/.well-known/openid-configuration`));
    return {
        authorization_endpoint: meta?.authorization_endpoint ??
            opts.authorization_endpoint ??
            `${auth_server_origin}/authorize`,
        token_endpoint: meta?.token_endpoint ??
            opts.token_endpoint ??
            `${auth_server_origin}/token`,
        registration_endpoint: meta?.registration_endpoint ?? opts.registration_endpoint,
    };
}
// RFC 7591 dynamic client registration.
async function register_client(endpoints, redirect_uri) {
    if (!endpoints.registration_endpoint) {
        throw new Error('No client_id configured and server does not support dynamic client registration. Set oauth.client_id in mcp.json.');
    }
    const registration = await fetch_json(endpoints.registration_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            client_name: CLIENT_NAME,
            redirect_uris: [redirect_uri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
        }),
    });
    return { client_id: registration.client_id, client_secret: registration.client_secret };
}
let browser_opener;
// Override how authorization URLs are opened (tests inject a fetch; a host app
// can inject its own browser launcher). Falls back to the OS opener.
export function set_browser_opener(fn) {
    browser_opener = fn ?? undefined;
}
function open_browser(url) {
    if (browser_opener) {
        try {
            void browser_opener(url);
        }
        catch {
            // ignore opener errors; the URL is also printed
        }
        return;
    }
    const command = process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
    try {
        const child = spawn(command, [url], {
            stdio: 'ignore',
            detached: true,
            shell: process.platform === 'win32',
        });
        child.on('error', () => { });
        child.unref();
    }
    catch {
        // Fall back to the printed URL.
    }
}
// Start the loopback callback listener. Resolves once it is listening, exposing
// the assigned redirect_uri, a promise for the authorization code, and a closer.
// Splitting listen from code-wait lets the caller register a client (which needs
// the redirect_uri) before opening the browser — one authorization round trip.
function start_callback_server(expected_state) {
    return new Promise((ready, ready_err) => {
        let resolve_code;
        let reject_code;
        const code_promise = new Promise((resolve, reject) => {
            resolve_code = resolve;
            reject_code = reject;
        });
        const server = createServer((req, res) => {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            if (url.pathname !== '/callback') {
                res.writeHead(404).end('Not found');
                return;
            }
            const error = url.searchParams.get('error');
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:3rem"><h2>${error || !code ? 'Authentication failed' : 'Authenticated'}</h2><p>You can close this tab and return to Pi.</p></body>`);
            close();
            if (error)
                reject_code(new Error(`OAuth authorization failed: ${error}`));
            else if (!code)
                reject_code(new Error('OAuth callback missing authorization code'));
            else if (state !== expected_state)
                reject_code(new Error('OAuth state mismatch — aborting for safety'));
            else
                resolve_code(code);
        });
        const timer = setTimeout(() => {
            close();
            reject_code(new Error('OAuth authorization timed out (5 min)'));
        }, CALLBACK_TIMEOUT_MS);
        timer.unref?.();
        const close = () => {
            clearTimeout(timer);
            server.close();
        };
        server.on('error', ready_err);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            ready({
                redirect_uri: `http://127.0.0.1:${port}/callback`,
                code_promise,
                close,
            });
        });
    });
}
function open_authorize(endpoints, client_id, redirect_uri, state, challenge, scopes, ctx, server_name) {
    const authorize_url = new URL(endpoints.authorization_endpoint);
    authorize_url.searchParams.set('response_type', 'code');
    authorize_url.searchParams.set('client_id', client_id);
    authorize_url.searchParams.set('redirect_uri', redirect_uri);
    authorize_url.searchParams.set('state', state);
    authorize_url.searchParams.set('code_challenge', challenge);
    authorize_url.searchParams.set('code_challenge_method', 'S256');
    if (scopes)
        authorize_url.searchParams.set('scope', scopes);
    const href = authorize_url.toString();
    const message = `Authenticate MCP server "${server_name}" — opening browser. If it does not open, visit:\n${href}`;
    if (ctx?.hasUI)
        ctx.ui.notify(message);
    else
        console.error(message);
    open_browser(href);
}
async function exchange_code(endpoints, client_id, client_secret, code, redirect_uri, code_verifier) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        client_id,
        code_verifier,
    });
    if (client_secret)
        body.set('client_secret', client_secret);
    return fetch_json(endpoints.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
}
async function refresh(endpoints, client_id, client_secret, refresh_token) {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
        client_id,
    });
    if (client_secret)
        body.set('client_secret', client_secret);
    return fetch_json(endpoints.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
}
function to_stored(name, endpoints, client_id, client_secret, token) {
    return {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: token.expires_in
            ? Date.now() + token.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS
            : undefined,
        token_endpoint: endpoints.token_endpoint,
        client_id,
        client_secret,
    };
}
function is_expired(stored) {
    return typeof stored.expires_at === 'number' && Date.now() >= stored.expires_at;
}
/**
 * Resolve a bearer config for an OAuth-protected HTTP server.
 * Uses a stored token when valid, refreshes when expired, and runs the full
 * interactive browser flow only when necessary (and only when a UI is present).
 * Returns undefined when no non-interactive token is available and no UI can
 * drive the login — the caller then connects unauthenticated (and may 401).
 */
export async function ensure_oauth_config(config, ctx, options = {}) {
    const stored = load_token(config.name);
    if (stored && !is_expired(stored) && stored.access_token) {
        return apply_bearer(config, stored.access_token);
    }
    if (stored?.refresh_token) {
        try {
            const token = await refresh({ token_endpoint: stored.token_endpoint, authorization_endpoint: '' }, stored.client_id ?? oauth_options(config).client_id ?? '', stored.client_secret ?? oauth_options(config).client_secret, stored.refresh_token);
            const next = to_stored(config.name, { token_endpoint: stored.token_endpoint, authorization_endpoint: '', registration_endpoint: undefined }, stored.client_id ?? '', stored.client_secret, { ...token, refresh_token: token.refresh_token ?? stored.refresh_token });
            save_token(config.name, next);
            return apply_bearer(config, next.access_token);
        }
        catch {
            // Refresh failed; fall through to interactive login.
        }
    }
    if (!options.interactive)
        return undefined;
    return run_interactive_login(config, options.www_authenticate, ctx);
}
export async function run_interactive_login(config, www_authenticate, ctx) {
    const endpoints = await discover_endpoints(config, www_authenticate);
    const opts = oauth_options(config);
    const scopes = Array.isArray(opts.scopes) ? opts.scopes.join(' ') : opts.scopes;
    const state = base64url(randomBytes(16));
    const pkce = create_pkce();
    const listener = await start_callback_server(state);
    try {
        // Register a client (RFC 7591) only after the loopback redirect_uri exists,
        // unless a client_id is preconfigured.
        let client_id = opts.client_id;
        let client_secret = opts.client_secret;
        if (!client_id) {
            const registered = await register_client(endpoints, listener.redirect_uri);
            client_id = registered.client_id;
            client_secret = registered.client_secret;
        }
        open_authorize(endpoints, client_id, listener.redirect_uri, state, pkce.challenge, scopes, ctx, config.name);
        const code = await listener.code_promise;
        const token = await exchange_code(endpoints, client_id, client_secret, code, listener.redirect_uri, pkce.verifier);
        const stored = to_stored(config.name, endpoints, client_id, client_secret, token);
        save_token(config.name, stored);
        return apply_bearer(config, stored.access_token);
    }
    finally {
        listener.close();
    }
}
//# sourceMappingURL=oauth.js.map
