/**
 * Connection recipes for AI clients, as data. The Connect AI page renders every entry with one
 * renderer; add a client here and it appears there.
 */

export interface ConnectConfig {
  /** Command that starts the stdio server. */
  command: string;
  args: string[];
  /** Streamable HTTP endpoint (with the toolsets filter when one is chosen). */
  url: string;
  apiUrl: string;
  openapiUrl: string;
  /** Bearer token when the server requires one (a placeholder when it is not shown here). */
  token?: string;
}

export interface Recipe {
  /** Where the snippet goes (a file, a settings screen or a terminal). */
  where: string;
  lang: 'json' | 'toml' | 'yaml' | 'shell' | 'python';
  code: (c: ConnectConfig) => string;
  note?: string;
}

export interface ClientDef {
  id: string;
  name: string;
  docs?: string;
  stdio?: Recipe;
  http?: Recipe;
  /** Shown when one of the variants is not supported. */
  limits?: string;
}

const j = (v: unknown) => JSON.stringify(v, null, 2);
const auth = (c: ConnectConfig) => (c.token ? { Authorization: `Bearer ${c.token}` } : undefined);
const withHeaders = (o: Record<string, unknown>, c: ConnectConfig, key = 'headers') =>
  auth(c) ? { ...o, [key]: auth(c) } : o;
const tomlList = (a: string[]) => `[${a.map((x) => JSON.stringify(x)).join(', ')}]`;
const shellArg = (s: string) => (/^[\w./:@=-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`);

export const CLIENTS: ClientDef[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    docs: 'https://docs.anthropic.com/en/docs/claude-code/mcp',
    stdio: {
      where: 'Terminal (or .mcp.json in the project, already included in this repository)',
      lang: 'shell',
      code: (c) => `claude mcp add reelforge -- ${[c.command, ...c.args].map(shellArg).join(' ')}`,
      note: 'Tools appear as mcp__reelforge__<tool>. Check with `claude mcp list`.',
    },
    http: {
      where: 'Terminal',
      lang: 'shell',
      code: (c) =>
        `claude mcp add --transport http reelforge ${shellArg(c.url)}${c.token ? ` --header ${shellArg(`Authorization: Bearer ${c.token}`)}` : ''}`,
      note: 'Keep `reelforge studio` running while you use it.',
    },
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    docs: 'https://modelcontextprotocol.io/quickstart/user',
    stdio: {
      where: 'Settings → Developer → Edit Config (claude_desktop_config.json)',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: { command: c.command, args: c.args } } }),
      note: 'Restart Claude Desktop after saving.',
    },
    limits: 'Claude Desktop connects to remote servers only through HTTPS connectors; use stdio locally.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    docs: 'https://docs.cursor.com/context/model-context-protocol',
    stdio: {
      where: '.cursor/mcp.json in the project (or ~/.cursor/mcp.json for every project)',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: { command: c.command, args: c.args } } }),
    },
    http: {
      where: '.cursor/mcp.json or ~/.cursor/mcp.json',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: withHeaders({ url: c.url }, c) } }),
    },
  },
  {
    id: 'vscode',
    name: 'VS Code · Copilot',
    docs: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
    stdio: {
      where: '.vscode/mcp.json in the project',
      lang: 'json',
      code: (c) => j({ servers: { reelforge: { type: 'stdio', command: c.command, args: c.args } } }),
      note: 'Use Copilot Chat in Agent mode and enable the reelforge tools.',
    },
    http: {
      where: '.vscode/mcp.json in the project',
      lang: 'json',
      code: (c) => j({ servers: { reelforge: withHeaders({ type: 'http', url: c.url }, c) } }),
    },
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    docs: 'https://docs.windsurf.com/windsurf/cascade/mcp',
    stdio: {
      where: 'Settings → Cascade → MCP servers → View raw config (~/.codeium/windsurf/mcp_config.json)',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: { command: c.command, args: c.args } } }),
    },
    http: {
      where: '~/.codeium/windsurf/mcp_config.json',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: withHeaders({ serverUrl: c.url }, c) } }),
    },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    docs: 'https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md',
    stdio: {
      where: '.gemini/settings.json in the project (or ~/.gemini/settings.json)',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: { command: c.command, args: c.args, timeout: 600000 } } }),
      note: 'Check it with /mcp inside Gemini CLI.',
    },
    http: {
      where: '.gemini/settings.json or ~/.gemini/settings.json',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: withHeaders({ httpUrl: c.url, timeout: 600000 }, c) } }),
    },
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    docs: 'https://github.com/openai/codex/blob/main/docs/config.md',
    stdio: {
      where: '~/.codex/config.toml',
      lang: 'toml',
      code: (c) =>
        `[mcp_servers.reelforge]\ncommand = ${JSON.stringify(c.command)}\nargs = ${tomlList(c.args)}\nstartup_timeout_sec = 30\ntool_timeout_sec = 600`,
    },
    http: {
      where: '~/.codex/config.toml',
      lang: 'toml',
      code: (c) =>
        `[mcp_servers.reelforge]\nurl = ${JSON.stringify(c.url)}${c.token ? '\nbearer_token_env_var = "REELFORGE_TOKEN"' : ''}`,
      note: 'Streamable HTTP needs a recent Codex release. With a token, export REELFORGE_TOKEN before starting Codex.',
    },
  },
  {
    id: 'zed',
    name: 'Zed',
    docs: 'https://zed.dev/docs/ai/mcp',
    stdio: {
      where: 'Zed settings.json',
      lang: 'json',
      code: (c) =>
        j({ context_servers: { reelforge: { source: 'custom', command: c.command, args: c.args } } }),
    },
    http: {
      where: 'Zed settings.json',
      lang: 'json',
      code: (c) => j({ context_servers: { reelforge: withHeaders({ source: 'custom', url: c.url }, c) } }),
    },
  },
  {
    id: 'continue',
    name: 'Continue',
    docs: 'https://docs.continue.dev/customize/deep-dives/mcp',
    stdio: {
      where: '.continue/mcpServers/reelforge.yaml in the project',
      lang: 'yaml',
      code: (c) =>
        `name: ReelForge\nversion: 1.0.0\nschema: v1\nmcpServers:\n  - name: reelforge\n    command: ${JSON.stringify(c.command)}\n    args:\n${c.args.map((a) => `      - ${JSON.stringify(a)}`).join('\n')}`,
      note: 'MCP tools are available in Agent mode.',
    },
    http: {
      where: '.continue/mcpServers/reelforge.yaml in the project',
      lang: 'yaml',
      code: (c) =>
        `name: ReelForge\nversion: 1.0.0\nschema: v1\nmcpServers:\n  - name: reelforge\n    type: streamable-http\n    url: ${JSON.stringify(c.url)}${c.token ? `\n    requestOptions:\n      headers:\n        Authorization: ${JSON.stringify(`Bearer ${c.token}`)}` : ''}`,
    },
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    docs: 'https://lmstudio.ai/docs/app/plugins/mcp',
    stdio: {
      where: 'Program → Install → Edit mcp.json',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: { command: c.command, args: c.args } } }),
      note: 'Pick a model with tool use; a vision model can also read preview_frames images.',
    },
    http: {
      where: 'Program → Install → Edit mcp.json',
      lang: 'json',
      code: (c) => j({ mcpServers: { reelforge: withHeaders({ url: c.url }, c) } }),
    },
  },
  {
    id: 'openai',
    name: 'OpenAI-compatible',
    docs: 'https://spec.openapis.org/oas/v3.1.0',
    http: {
      where: 'Any agent framework with function calling (or a GPT Action importing the OpenAPI URL)',
      lang: 'python',
      code: (c) =>
        [
          'import json, requests',
          '',
          `API = ${JSON.stringify(c.apiUrl)}`,
          `HEADERS = ${c.token ? `{"Authorization": "Bearer ${c.token}"}` : '{}'}`,
          '',
          '# Every ReelForge tool as an OpenAI function definition',
          'tools = requests.get(f"{API}/tools?format=openai", headers=HEADERS).json()',
          '',
          'def call_tool(name: str, arguments: str) -> str:',
          '    r = requests.post(f"{API}/tools/{name}", json=json.loads(arguments or "{}"), headers=HEADERS)',
          '    data = r.json()  # {"ok": bool, "result": {...}, "text": "...", "error": "..."}',
          '    return data["text"] if data.get("ok") else "Error: " + data.get("error", "")',
          '',
          `# OpenAPI 3.1 (one operation per tool): ${c.openapiUrl}`,
        ].join('\n'),
      note: 'Pass `tools` to chat.completions.create(…, tools=tools) and answer each tool call with call_tool().',
    },
    limits: 'No MCP: uses the REST API (/api/v1) that serves the same tools.',
  },
];
