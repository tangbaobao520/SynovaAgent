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

### MCP（stdio 工具服务，双轨策略 #2）
- `src/mcp/index.ts`：stdio 服务，工具 = sentinel_list / sentinel_run / diagnose_organization / query_ontology / ingest_document / get_session
- **缺口**：企业接入的配置文档、认证/权限控制（企业内部数据安全）、工具覆盖与企业 agent 场景核对、与 Electron 打包后 MCP 服务的运行架构
- 注：`src/mcp/bridge.ts` 是反向（Synova 消费外部 MCP 工具），勿混淆

## 落地任务建议

| D# | 任务 | 优先级 |
|----|------|:---:|
| 待排 | Electron 一体化：服务端打包 + 自启 + 就绪开窗 + 安装包（win/mac） | P0 |
| 待排 | MCP 企业接入完善：配置文档 + 认证/权限 + 工具核对 + 打包架构 | P0 |
| 待排 | TUI / CLI / mvp 退役（先核引用：bin/synova 指向、wire-check/verify-incremental 入口清单、arch 基线） | P1 |
