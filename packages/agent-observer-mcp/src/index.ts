#!/usr/bin/env node
/**
 * @synova/agent-observer-mcp — MCP Server for Synova Agent Observer
 *
 * 启动 MCP Server (stdio transport)，Agent 调用工具时自动上报到 Synova。
 * 覆盖: Claude Code, Cline, Continue, Windsurf, Cursor, Copilot, OpenClaw, Goose ...
 * 所有框架只需在配置文件中加一段 JSON 即可接入。
 *
 * 环境变量:
 *   SYNOVA_BASE_URL — Synova 服务地址 (默认 http://localhost:3000)
 *   SYNOVA_TEAM_ID   — 团队/组织 ID (默认 default)
 *   AGENT_NAME        — 本 Agent 的可读名称 (默认取 hostname)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import * as os from 'os';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';

const SYNOVA_URL = process.env.SYNOVA_BASE_URL || 'http://localhost:3000';
const TEAM_ID = process.env.SYNOVA_TEAM_ID || 'default';
const AGENT_NAME = process.env.AGENT_NAME || os.hostname();

/** Fire-and-forget HTTP POST to Synova. Never throws, never blocks. */
function reportToolCall(toolName: string, toolArgs: Record<string, unknown>): void {
  const payload = JSON.stringify({
    agentId: AGENT_NAME,
    platform: 'mcp',
    name: AGENT_NAME,
    agentType: 'external',
    activityType: 'tool_call',
    toolName: toolName,
    lastToolName: toolName,
    detail: typeof toolArgs === 'object' ? JSON.stringify(toolArgs).slice(0, 1000) : undefined,
    timestamp: new Date().toISOString(),
    teamId: TEAM_ID,
    success: true,
  });

  const url = new URL(`${SYNOVA_URL}/api/agent-observer/report`);
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;

  const req = transport(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 3000,
    },
    (res) => {
      // 静默消费响应 — fire-and-forget
    },
  );

  req.on('error', () => {
    // 静默降级 — 不影响 Agent 工具调用 (铁律 31)
  });

  req.on('timeout', () => {
    req.destroy();
  });

  req.write(payload);
  req.end();
}

// ── MCP Server ──

const server = new Server(
  { name: 'synova-observer', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// 列出工具 (告知 Agent 此 observer 可用)
server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => ({
  tools: [
    {
      name: 'synova_report_activity',
      description: 'Report agent activity to Synova SOG graph for organization diagnosis. Called automatically on every tool use.',
      inputSchema: {
        type: 'object',
        properties: {
          toolName: { type: 'string', description: 'The tool being called' },
          toolArgs: { type: 'object', description: 'Tool arguments (optional)' },
        },
      },
    },
  ],
}));

// 工具调用处理 — 上报到 Synova (fire-and-forget)
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;
  reportToolCall(name, (args || {}) as Record<string, unknown>);
  return { content: [{ type: 'text', text: 'ok' }] };
});

// 启动 — stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
