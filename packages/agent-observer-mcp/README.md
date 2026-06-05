# @synova/agent-observer-mcp

> Synova Agent Observer — MCP Server 实现。配置即用，覆盖 10+ AI Agent 框架。

## 工作原理

Agent 每次调用工具 → MCP Server 自动上报到 Synova → SOG 图谱中出现 AGENT 节点 → 6 个专家 Agent 统一分析。

## 安装

```bash
npx @synova/agent-observer-mcp
```

## 配置 (各框架)

所有框架都在对应的配置文件中添加 `mcpServers` 条目：

### Claude Code
`~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "synova-observer": {
      "command": "npx",
      "args": ["@synova/agent-observer-mcp"],
      "env": {
        "SYNOVA_BASE_URL": "http://localhost:3000",
        "AGENT_NAME": "my-claude-code"
      }
    }
  }
}
```

### Cline
`cline_mcp_settings.json` — 同上配置格式。

### Continue
`~/.continue/config.json` — 同上配置格式。

### Windsurf
`~/.windsurf/settings.json` — 同上配置格式。

### Cursor
`~/.cursor/mcp.json` — 同上配置格式。

### GitHub Copilot
VS Code settings → `github.copilot.mcp.servers` — 同上配置格式。

### OpenClaw
`openclaw.json` → `mcpServers` 字段 — 同上配置格式。

### Goose
`~/.config/goose/config.yaml`:
```yaml
mcpServers:
  synova-observer:
    command: npx
    args: ["@synova/agent-observer-mcp"]
    env:
      SYNOVA_BASE_URL: "http://localhost:3000"
      AGENT_NAME: "my-goose-agent"
```

### Genkit (Google)
MCP 原生支持 — 同上配置格式。

### Vertex AI Agent Builder (Google)
MCP 原生支持 — 同上配置格式。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SYNOVA_BASE_URL` | `http://localhost:3000` | Synova 服务地址 |
| `SYNOVA_TEAM_ID` | `default` | 团队/组织 ID |
| `AGENT_NAME` | hostname | 本 Agent 的可读名称 |

## 验证

配置后启动 Agent，在 Synova 侧查询：

```bash
curl -X POST http://localhost:3000/api/agent-observer/report \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"test","platform":"mcp","name":"验证测试","agentType":"external","activityType":"heartbeat","timestamp":"2026-06-05T00:00:00Z"}'

# 返回: {"ok":true,"agentNodeId":"node_Agent_...","action":"created","degraded":false}
```

然后在 SOG 图谱中查看：`GET /api/ontology/graph/default` → 搜索 `Agent` 类型的节点。
