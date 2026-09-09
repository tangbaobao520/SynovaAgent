# 接口面策略（产品决策，2026-08-12 创始人定）

## 决策

> **本地部署 + 非开发者用户**：企业日常使用走 **Electron 桌面端**（最高优先级）；**MCP 同步最高优先级**（接入已用 codex/workbuddy 等 agent 的企业）。Web UI / HTTP API / Docker 延后。TUI / CLI / mvp-server 退役。

| 接口面 | 优先级 | 定位 |
|--------|:---:|------|
| **Electron 桌面端** | **P0** | 企业日常主界面（本地部署、数据不出公司、非开发者开箱即用） |
| **MCP** | **P0** | 企业已有 AI agent（codex/workbuddy 等）经 MCP 直接调用 Synova 能力 |
| Web UI（app/*.html） | 延后 | 保留（桌面窗口内容即 Web UI），非独立主开发面 |
| HTTP API（REST） | 延后 | 底座（服务自带），非独立开发面 |
| Docker | 延后 | 私有化后续 |
| TUI / CLI / mvp-server | 退役 | 终端场景与产品定位不符 |

## 现状（2026-08-12 代码审计）

### Electron（瘦客户端，D111+D233）
- `electron/main.cjs`：BrowserWindow 指向 `http://localhost:18790` + 托盘 + P0 通知 + 离线页 + healthz 检测
- **缺口**：不自启本地服务（无 spawn）——非开发者用户无法"安装即用"；需要"服务端打包进 app + 启动时自启 + 就绪后开窗"（D47 双进程架构完整落地）
- 待核：build-synova.cjs 的 files 是否已含服务端 dist

### MCP（stdio 工具服务，双轨策略 #2）— D595 已处置（2026-09-09）
- `src/mcp/index.ts`：stdio 服务（@modelcontextprotocol/sdk 1.30.0，D595 SDK 化），**12 工具** =
  sentinel_list / sentinel_run / sentinel_run_all / sentinel_summary（原 flywheel_speeds 诚实化改名）/
  data_source_status / diagnose_organization / query_ontology / ingest_document / get_session /
  sentinel_reports / sentinel_tickets / knowledge_ask（后三个为 D595 补齐）
- 原缺口四项 → D595 处置状态：
  - ✅ 企业接入的配置文档 — README「MCP 接入」节（mcpServers 配置片段 + 12 工具表）
  - ✅ 认证/权限控制 — stdio 本机信任显式声明（启动 stderr + initialize instructions，
    契约串 `SYNOVA-MCP-CONTRACT: 1`）+ 读写两级权限（SYNOVA_MCP_MODE，fail-closed）
  - ✅ 工具覆盖核对 — 9→12（报告/工单/知识问答补齐；多轮对话工具缓——Stage 2 随契约固化设计，
    审计 §8.2.2 会话语义双轨风险）
  - ⏳ 与 Electron 打包后 MCP 服务的运行架构 — 待排（桌面一体化任务域）
- 注：`src/mcp/bridge.ts` 是反向（Synova 消费外部 MCP 工具），勿混淆

## 落地任务建议

| D# | 任务 | 优先级 |
|----|------|:---:|
| 待排 | Electron 一体化：服务端打包 + 自启 + 就绪开窗 + 安装包（win/mac） | P0 |
| D595（已完成 2026-09-09） | MCP 企业接入完善：配置文档 + 认证/权限 + 工具核对（打包架构除外） | P0 |
| Stage 2 | MCP 契约冻结 + 多轮对话工具（随会话投影 D587/D588 对齐设计） | P1 |
| 待排 | TUI / CLI / mvp 退役（先核引用：bin/synova 指向、wire-check/verify-incremental 入口清单、arch 基线） | P1 |
