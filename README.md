# SynovaAgent

**Powered by NemoClaw, Brain by Synova** — 组织诊断智能体。

独立进程，配置 LLM 即用。通过结构化访谈了解你的组织，运行六阶段诊断分析，构建 SOG-Core v1.0 本体图，持续监控组织健康。

双轨部署：国际 NemoClaw 生态集成（MCP 工具 + 机密计算 + GPU 加速） / 国内自主可控（DomesticHub + 国产 TEE）。

## 快速开始

### Docker
```bash
docker run -p 3000:3000 -e LLM_API_KEY=sk-your-key synova-agent
```

### 一键安装 (macOS/Linux)
```bash
curl -fsSL https://raw.githubusercontent.com/nousresearch/synova-agent/main/scripts/install.sh | bash
```

### 一键安装 (Windows)
```powershell
iwr -useb https://raw.githubusercontent.com/nousresearch/synova-agent/main/scripts/install.ps1 | iex
```

### 开发模式
```bash
git clone https://github.com/nousresearch/synova-agent
cd synova-agent
npm install
DEV_MODE=true LLM_API_KEY=sk-your-key npx tsx src/index.ts
```

## 配置

### 必选（二选一）

| 环境变量 | 说明 |
|---------|------|
| `LLM_API_KEY` | LLM API Key（通用，所有兼容 OpenAI API 的服务） |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（与 LLM_API_KEY 等效） |

### 国产大模型接入

SynovaAgent 通过 OpenAI 兼容协议支持所有国产大模型。修改 `LLM_BASE_URL` 和 `LLM_MODEL`。

> 模型名称对照 Hermes 开源项目的实际配置，已验证 API 兼容性。

| 厂商 | LLM_BASE_URL | LLM_MODEL | Key 环境变量 |
|------|-------------|-----------|-------------|
| **DeepSeek**（默认） | `https://api.deepseek.com/v1` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| **通义千问**（阿里云百炼） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | `DASHSCOPE_API_KEY` |
| **智谱 GLM** | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` | `GLM_API_KEY` |
| **月之暗面 Kimi** | `https://api.moonshot.cn/v1` | `kimi-k2-turbo-preview` | `KIMI_API_KEY` |
| **MiniMax** | `https://api.minimax.chat/v1` | `abab6.5s-chat` | `MINIMAX_API_KEY` |
| **阶跃星辰 StepFun** | `https://api.stepfun.com/v1` | `step-3.5-flash` | `STEPFUN_API_KEY` |
| **零一万物** | `https://api.lingyiwanwu.com/v1` | `yi-large` | — |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o` | — |

> 注：百度文心 ERNIE 使用非标准 API 协议，暂不支持。MiniMax 国际版使用 Anthropic Messages API，国内版使用 OpenAI 兼容协议。

启动示例：
```bash
# DeepSeek（默认）
$env:LLM_API_KEY="sk-your-key"; npx tsx src/index.ts

# 通义千问
$env:LLM_API_KEY="sk-your-key"; $env:LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"; $env:LLM_MODEL="qwen-plus"; npx tsx src/index.ts

# Kimi
$env:LLM_API_KEY="sk-your-key"; $env:LLM_BASE_URL="https://api.moonshot.cn/v1"; $env:LLM_MODEL="kimi-k2-turbo-preview"; npx tsx src/index.ts
```

### 可选

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LLM_BASE_URL` | LLM API 地址 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名称 | `deepseek-chat` |
| `PORT` | HTTP 端口 | `3000` |
| `SYNOVA_DB_PATH` | 数据库路径 | `./data/synova.db` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `DEV_MODE` | 开发模式（跳过 LLM Key 校验） | `false` |

## 接口

### HTTP API
```
GET  /health                         → 健康检查
GET  /api/status                     → LLM 配置状态
POST /api/ontology/ingest            → 文档摄取
GET  /api/ontology/graph/:orgId      → 图查询
GET  /api/ontology/graph/:orgId.html → HTML 可视化
POST /api/diagnosis/consult          → SSE 流式诊断
GET  /api/sessions                   → 会话列表
```

### CLI 对话
```bash
npx tsx src/cli.ts
```

### Web 界面
```
http://localhost:3000
```

## 项目结构

```
synova-agent/
├── src/
│   ├── index.ts            ← 入口
│   ├── cli.ts              ← 终端对话
│   ├── setup.ts            ← LLM 配置向导
│   ├── config.ts           ← 配置读取
│   ├── server.ts           ← HTTP 服务
│   ├── agent/              ← Agent 对话运行时
│   │   ├── conversation.ts ← 对话状态机
│   │   ├── tools.ts        ← 工具注册引擎
│   │   └── builtin-tools.ts← 内置工具
│   ├── providers/          ← LLM Provider 适配层
│   ├── store/              ← 持久化层
│   │   └── session-store.ts← SQLite 会话存储
│   ├── init/               ← 初始化
│   └── routes/             ← HTTP 路由
├── tests/                  ← 测试 (53 tests)
├── scripts/                ← 安装脚本
├── Dockerfile
└── docker-compose.yml
```

## 测试

```bash
npm test                    # vitest run (53 tests)
```

## 许可

MIT
