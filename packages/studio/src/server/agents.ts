/**
 * The dashboard's endpoints for AI clients (ADR-014): MCP Streamable HTTP at /mcp, the REST tool API
 * at /api/v1 (with its OpenAPI document) and discovery files (/llms.txt, /.well-known/mcp.json).
 * All of them serve the one tool registry.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { INSTALL_ROOT } from '@reelforge/core';
import { createMcpDispatcher, PROTOCOLS, type McpDispatcher } from '../tools/mcp.js';
import { openApiDocument, serverCard } from '../tools/openapi.js';
import { callTool, describeTool, parseToolsets, selectTools } from '../tools/registry.js';
import { docFile } from '../tools/resources.js';
import { ToolError, type Json, type ToolHost, type ToolResult } from '../tools/types.js';
import { readBody, sendFile } from './http.js';
import { tokenMatches } from './security.js';

const MAX_BODY = 8 << 20;
const MAX_SESSIONS = 200;

export interface AgentApiOptions {
  host: ToolHost;
  version: string;
  /** The bearer token, when /mcp and /api/v1 require one. */
  token?: string;
}

/** Paths a client on another computer may reach (everything else is the local dashboard). */
export const isAgentPath = (p: string) =>
  p === '/mcp' ||
  p === '/api/v1' ||
  p.startsWith('/api/v1/') ||
  p === '/llms.txt' ||
  p === '/llms-full.txt' ||
  p === '/.well-known/mcp.json';

/** The stdio command that starts the MCP server for this project. */
export const stdioCommand = (root: string) => ({
  command: 'node',
  args: [path.join(INSTALL_ROOT, 'packages', 'cli', 'bin', 'reelforge.js'), 'mcp', '--root', root],
});

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

const send = (res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(data));
};

/** REST shape of a tool result. */
export function restResult(r: ToolResult): Json {
  const textOut = r.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n\n');
  const images = r.content
    .filter((c): c is { type: 'image'; data: string; mimeType: string } => c.type === 'image')
    .map(({ mimeType, data }) => ({ mimeType, data }));
  return {
    ok: !r.isError,
    ...(r.isError ? { error: textOut.split('\n')[0] || 'The tool failed' } : {}),
    ...(r.structuredContent ? { result: r.structuredContent } : {}),
    text: textOut,
    ...(images.length ? { images } : {}),
  };
}

export function createAgentApi(opts: AgentApiOptions) {
  const sessions = new Map<string, { protocol: string; created: number }>();
  const dispatchers = new Map<string, McpDispatcher>();

  const toolsetsOf = (url: URL) => {
    try {
      return parseToolsets(url.searchParams.get('toolsets'));
    } catch (e) {
      throw new ApiError(400, (e as Error).message);
    }
  };
  const dispatcherFor = (url: URL) => {
    const sets = toolsetsOf(url);
    const key = sets === 'all' ? 'all' : [...sets].sort().join(',');
    let d = dispatchers.get(key);
    if (!d)
      dispatchers.set(
        key,
        (d = createMcpDispatcher({ host: opts.host, version: opts.version, toolsets: sets })),
      );
    return d;
  };
  const originOf = (req: IncomingMessage) => `http://${req.headers.host}`;

  const authorize = (req: IncomingMessage) => {
    if (opts.token && !tokenMatches(req.headers.authorization, opts.token))
      throw new ApiError(401, 'Missing or wrong bearer token (Authorization: Bearer <token>)', {
        'www-authenticate': 'Bearer realm="reelforge"',
      });
  };

  const jsonBody = async (req: IncomingMessage): Promise<unknown> => {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
      throw new ApiError(415, 'Expected application/json');
    let raw: string;
    try {
      raw = await readBody(req, MAX_BODY);
    } catch {
      throw new ApiError(413, 'Body too large');
    }
    try {
      return JSON.parse(raw || '{}');
    } catch {
      throw new ApiError(400, 'Invalid JSON body');
    }
  };

  // ---------------------------------------------------------------- MCP Streamable HTTP
  const mcp = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const sid = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sid) ? sid[0] : sid;
    if (req.method === 'DELETE') {
      if (!sessionId || !sessions.delete(sessionId)) throw new ApiError(404, 'Unknown session');
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'POST')
      throw new ApiError(405, 'Use POST for MCP messages (this server does not stream over GET)', {
        allow: 'POST, DELETE',
      });
    if (sessionId && !sessions.has(sessionId)) throw new ApiError(404, 'Unknown or expired session');
    const version = req.headers['mcp-protocol-version'];
    if (typeof version === 'string' && version && !PROTOCOLS.includes(version))
      throw new ApiError(400, `Unsupported MCP-Protocol-Version "${version}" (${PROTOCOLS.join(', ')})`);
    const dispatcher = dispatcherFor(url);
    let body: unknown;
    try {
      body = await jsonBody(req);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400)
        return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      throw e;
    }
    const batch = Array.isArray(body);
    const msgs = batch ? (body as unknown[]) : [body];
    if (!msgs.length)
      return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Empty batch' } });
    const out = (await Promise.all(msgs.map((m) => dispatcher.handle(m)))).filter((r): r is Json => !!r);
    const headers: Record<string, string> = {};
    const init = msgs.findIndex((m) => (m as Json | null)?.method === 'initialize');
    if (init >= 0) {
      const reply = out.find((r) => r.id === (msgs[init] as Json).id && r.result);
      if (reply) {
        const id = randomUUID();
        sessions.set(id, {
          protocol: String((reply.result as Json).protocolVersion),
          created: Date.now(),
        });
        while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
        headers['mcp-session-id'] = id;
      }
    }
    if (!out.length) {
      res.writeHead(202, headers).end();
      return;
    }
    return send(res, 200, batch ? out : out[0], headers);
  };

  // ---------------------------------------------------------------- REST
  const rest = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const p = url.pathname.replace(/\/+$/, '');
    const get = req.method === 'GET' || req.method === 'HEAD';
    if (p === '/api/v1/health' && get) {
      const tools = selectTools();
      return send(res, 200, {
        ok: true,
        name: 'reelforge',
        version: opts.version,
        tools: tools.length,
        mcp: `${originOf(req)}/mcp`,
        openapi: `${originOf(req)}/api/v1/openapi.json`,
        auth: { required: Boolean(opts.token) },
      });
    }
    if (p === '/api/v1/tools' && get) {
      const tools = selectTools(toolsetsOf(url));
      if (url.searchParams.get('format') === 'openai')
        return send(
          res,
          200,
          tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: describeTool(t).inputSchema },
          })),
        );
      return send(res, 200, { tools: tools.map(describeTool) });
    }
    if (p === '/api/v1/openapi.json' && get)
      return send(
        res,
        200,
        openApiDocument(selectTools(toolsetsOf(url)), {
          origin: originOf(req),
          version: opts.version,
          tokenRequired: Boolean(opts.token),
        }),
      );
    const m = /^\/api\/v1\/tools\/([a-z0-9_]+)$/.exec(p);
    if (m) {
      if (req.method !== 'POST')
        throw new ApiError(405, 'Use POST with the tool arguments as JSON', { allow: 'POST' });
      const tool = selectTools(toolsetsOf(url)).find((t) => t.name === m[1]);
      if (!tool) throw new ApiError(404, `Unknown tool "${m[1]}". GET /api/v1/tools lists them.`);
      const args = await jsonBody(req);
      const r = await callTool(tool, args, { ...opts.host, progress: () => undefined });
      return send(res, 200, restResult(r));
    }
    throw new ApiError(404, 'Unknown endpoint. See /api/v1/openapi.json');
  };

  /** Handles an agent path; returns false for anything else. Host/Origin are checked by the caller. */
  const handle = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> => {
    const p = url.pathname;
    if (!isAgentPath(p)) return false;
    try {
      if (p === '/llms.txt' || p === '/llms-full.txt') {
        const f = docFile(opts.host.root, p.slice(1));
        if (!f) throw new ApiError(404, `${p.slice(1)} is not available`);
        sendFile(req, res, f);
        return true;
      }
      if (p === '/.well-known/mcp.json') {
        send(
          res,
          200,
          serverCard(selectTools(), {
            origin: originOf(req),
            version: opts.version,
            tokenRequired: Boolean(opts.token),
            stdio: stdioCommand(opts.host.root),
          }),
        );
        return true;
      }
      authorize(req);
      if (p === '/mcp') await mcp(req, res, url);
      else await rest(req, res, url);
    } catch (e) {
      const err = e instanceof ApiError ? e : e instanceof ToolError ? new ApiError(400, e.message) : null;
      if (!err) opts.host.log(`agent API error: ${(e as Error).stack ?? e}`);
      if (!res.headersSent)
        send(
          res,
          err?.status ?? 500,
          { ok: false, error: err ? err.message : `Internal error: ${(e as Error).message}` },
          err?.headers,
        );
      else res.end();
    }
    return true;
  };

  return { handle };
}
