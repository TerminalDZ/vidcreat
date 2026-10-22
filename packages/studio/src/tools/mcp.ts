/**
 * Transport-independent MCP (JSON-RPC 2.0) dispatcher over the tool registry. The stdio transport
 * (`reelforge mcp`) and the Streamable HTTP endpoint of the dashboard (`/mcp`) both feed it messages.
 */
import { describeTool, callTool, selectTools } from './registry.js';
import { PROMPTS, readResource, RESOURCE_TEMPLATES, RESOURCES, ResourceNotFound } from './resources.js';
import { ToolError, type Json, type ToolHost, type Toolset } from './types.js';

/** Supported protocol revisions, newest first. */
export const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS =
  "ReelForge turns a voice recording and an episode.yaml into finished vertical (1080×1920) explainer videos. Read the episode with get_episode before editing; anchor element timing to spoken words (l3:'word'); validate_episode after edits (every write returns fixes and a next step); use preview_frames to look at the result. get_guide has task guides. Rendering runs in the background (render_episode + get_render_status). Everything is local.";

export interface McpDispatcherOptions {
  host: ToolHost;
  version: string;
  toolsets?: Toolset[] | 'all';
}

export interface McpDispatcher {
  /**
   * Handles one JSON-RPC message and returns the response, or undefined for notifications and
   * responses. `notify` receives progress notifications (omit it where the transport cannot stream).
   */
  handle(msg: unknown, notify?: (m: Json) => void): Promise<Json | undefined>;
}

export function createMcpDispatcher(opts: McpDispatcherOptions): McpDispatcher {
  const tools = selectTools(opts.toolsets ?? 'all');
  const ok = (id: unknown, result: unknown): Json => ({ jsonrpc: '2.0', id, result });
  const fail = (id: unknown, code: number, message: string): Json => ({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  });

  const handle = async (raw: unknown, notify?: (m: Json) => void): Promise<Json | undefined> => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(null, -32600, 'Invalid Request');
    const msg = raw as Json;
    const { id, method } = msg;
    const params = (msg.params ?? {}) as Json;
    if (method === undefined) return undefined; // a response to something we never sent
    const isNotification = id === undefined || id === null;
    try {
      switch (method) {
        case 'initialize': {
          const asked = String(params.protocolVersion ?? '');
          return ok(id, {
            protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false },
              prompts: { listChanged: false },
              logging: {},
            },
            serverInfo: { name: 'reelforge', title: 'ReelForge', version: opts.version },
            instructions: INSTRUCTIONS,
          });
        }
        case 'notifications/initialized':
        case 'notifications/cancelled':
          return undefined;
        case 'ping':
        case 'logging/setLevel':
          return isNotification ? undefined : ok(id, {});
        case 'tools/list':
          return ok(id, {
            tools: tools.map((t) => {
              const { toolsets: _toolsets, ...d } = describeTool(t);
              return d;
            }),
          });
        case 'tools/call': {
          const tool = tools.find((t) => t.name === params.name);
          if (!tool) return fail(id, -32602, `Unknown tool: ${String(params.name)}`);
          const token = (params._meta as Json | undefined)?.progressToken;
          const progress = (p: number, total?: number, message?: string) => {
            if (token !== undefined && notify)
              notify({
                jsonrpc: '2.0',
                method: 'notifications/progress',
                params: { progressToken: token, progress: p, total, message },
              });
          };
          return ok(id, await callTool(tool, params.arguments ?? {}, { ...opts.host, progress }));
        }
        case 'resources/list':
          return ok(id, {
            resources: RESOURCES.map(({ uri, name, description, mimeType }) => ({
              uri,
              name,
              description,
              mimeType,
            })),
          });
        case 'resources/templates/list':
          return ok(id, { resourceTemplates: RESOURCE_TEMPLATES });
        case 'resources/read':
          try {
            return ok(id, { contents: [readResource(opts.host, String(params.uri ?? ''))] });
          } catch (e) {
            if (e instanceof ResourceNotFound) return fail(id, -32002, e.message);
            throw e;
          }
        case 'prompts/list':
          return ok(id, {
            prompts: PROMPTS.map(({ name, description, arguments: args }) => ({
              name,
              description,
              arguments: args,
            })),
          });
        case 'prompts/get': {
          const pr = PROMPTS.find((x) => x.name === params.name);
          if (!pr) return fail(id, -32602, `Unknown prompt: ${String(params.name)}`);
          return ok(id, {
            description: pr.description,
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: pr.text((params.arguments ?? {}) as Record<string, string>) },
              },
            ],
          });
        }
        case 'completion/complete':
          return ok(id, { completion: { values: [], hasMore: false } });
        default:
          return isNotification ? undefined : fail(id, -32601, `Method not found: ${String(method)}`);
      }
    } catch (e) {
      if (isNotification) return undefined;
      return fail(id, e instanceof ToolError ? -32602 : -32603, (e as Error).message);
    }
  };
  return { handle };
}
