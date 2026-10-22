/** OpenAPI 3.1 description of the REST tool API and the MCP server card, generated from the registry. */
import { describeTool, toolsetMembers } from './registry.js';
import { PROTOCOLS, INSTRUCTIONS } from './mcp.js';
import { TOOLSETS, type AnyTool, type Json } from './types.js';

export interface ApiInfo {
  /** Base URL of the server, e.g. http://127.0.0.1:4310 */
  origin: string;
  version: string;
  tokenRequired: boolean;
}

const RESPONSE = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: { type: 'boolean', description: 'false when the tool reported a problem (see error)' },
    result: {
      type: 'object',
      additionalProperties: true,
      description: 'Structured result of the tool (validation summary, fixes and next step for writes)',
    },
    text: { type: 'string', description: 'The human-readable result' },
    error: { type: 'string' },
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: { mimeType: { type: 'string' }, data: { type: 'string', contentEncoding: 'base64' } },
      },
    },
  },
};

export function openApiDocument(tools: readonly AnyTool[], info: ApiInfo): Json {
  const paths: Json = {};
  for (const t of tools) {
    const d = describeTool(t);
    paths[`/api/v1/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.title,
        description: t.description,
        tags: d.toolsets,
        'x-reelforge-toolsets': d.toolsets,
        ...(t.annotations?.readOnlyHint ? { 'x-openai-isConsequential': false } : {}),
        requestBody: {
          required: true,
          content: { 'application/json': { schema: d.inputSchema } },
        },
        responses: {
          '200': {
            description: 'The tool ran; ok is false when it reported a problem the caller can fix',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ToolResponse' } } },
          },
          '400': { description: 'Invalid JSON body' },
          '401': { description: 'Missing or wrong bearer token' },
          '403': { description: 'Host or Origin not allowed' },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'ReelForge tools',
      version: info.version,
      description:
        'Every ReelForge tool as one operation (operationId = tool name, request body = the tool arguments). The same tools are served over MCP at /mcp. Tool names and arguments follow semver.',
    },
    servers: [{ url: info.origin }],
    tags: TOOLSETS.map((name) => ({ name })),
    paths,
    components: {
      schemas: { ToolResponse: RESPONSE },
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    },
    ...(info.tokenRequired ? { security: [{ bearerAuth: [] }] } : {}),
  };
}

/** The server card served at /.well-known/mcp.json. */
export function serverCard(
  tools: readonly AnyTool[],
  info: ApiInfo & { stdio: { command: string; args: string[] } },
): Json {
  return {
    name: 'reelforge',
    title: 'ReelForge',
    version: info.version,
    description:
      'Turns a voice recording and an episode.yaml into finished vertical explainer videos. Local and deterministic.',
    instructions: INSTRUCTIONS,
    protocolVersions: PROTOCOLS,
    transports: [
      { type: 'stdio', command: info.stdio.command, args: info.stdio.args },
      { type: 'streamable-http', url: `${info.origin}/mcp` },
    ],
    rest: {
      openapi: `${info.origin}/api/v1/openapi.json`,
      tools: `${info.origin}/api/v1/tools`,
    },
    auth: {
      type: 'bearer',
      header: 'Authorization',
      required: info.tokenRequired,
      appliesTo: ['/mcp', '/api/v1'],
    },
    toolsets: toolsetMembers(),
    tools: tools.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      toolsets: t.toolsets,
    })),
    documentation: { llms: `${info.origin}/llms.txt`, llmsFull: `${info.origin}/llms-full.txt` },
  };
}
