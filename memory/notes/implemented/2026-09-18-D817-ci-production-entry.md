---
状态: implemented
日期: 2026-09-18
落地: D817（2026-09-19，分支 feat/d817-production-entry-conversation）——交付 tests/helpers/fake-llm-upstream.ts + tests/integration/production-entry-conversation.integration.test.ts + docs/synova/product-lines/evidence/D817-capture-20260918.json。执行中新发现两处产品缺陷（D817-F1 响应侧 tool_calls 未映射 / D817-F2 assistant 重复入上下文），与 P0-1 一并以 it.fails 证词化；全程零 src/** 改动。
决策: 立 **第 0 项 = CI 能跑一次"生产入口级对话"**（D817），并把它定为研究院四份任务书**全部 15 项验收标准的公共前置**：验收判据从"grep 命中"升级为"起真实 server、打真实 HTTP 路由、在假上游抓到真实出站请求体"。同时定下三条纪律——① 不得在生产代码加测试专用开关（走既有配置缝）② 不得改 CI 排除清单来让测试变绿 ③ P0-1（工具 schema 未进请求体）以 `it.fails` 形式**证词化**，修好后必须翻转并删除。
理由: ① `vitest.config.ts:29-37` 在 CI 下排除 `tests/e2e/**`（注释 "Needs LLM API"）→ 任务书里每条"穿真实入口"的验收今天**一条都无法自动判定**；② 研究院交叉验证：这条与 CTO 此前独立得出的"验证基础设施缺口"是同一件事，两条独立路径指向同一处；③ 不解决它，8 个任务会重演"测试全绿但生产不通"——而该模式在本仓**已发生 8 次**（横跨 4 层，见 `可派工任务书-自研缺陷修复.md` §三）；④ 范式已存在（`tests/smoke.test.ts` 起 `createServer`；`tests/routes/diagnosis-token-meter.integration.test.ts` 已按铁律 12 用 `listen(0)+fetch` 打真实路由）→ 本项是**接线与纪律**，不是造轮子。
---

## 触发场景（CTO 实测，2026-09-18，origin/main `283a428f`）

| 事实 | 命令 / 位置 | 结果 |
|---|---|---|
| CI 排除 e2e | `vitest.config.ts:29-37` | `exclude: CI ? ['tests/e2e/**', …]`（"Needs LLM API"）→ 生产入口级验收不可自动判定 |
| 工具 schema 到不了模型 | `src/providers/base.ts:139-151` | 出站 body 只有 `model/messages/temperature/max_tokens/stream`；**无 `tools`**；`tool-loop-executor.ts:112,251` 确实把 `tools` 传了进去 → 在 provider 边界被丢弃 |
| 范式已存在 | `tests/smoke.test.ts:9,15` / `tests/routes/diagnosis-token-meter.integration.test.ts:10,114` | `createServer` from `src/server` + `listen(0)` + `fetch` 真实路由（铁律 12：不 mock 管线） |
| 目标路由存在 | `src/routes/conversations.ts:359` | `POST /api/conversations/:id/messages` |

## 落地（D817）

- 新增 `tests/helpers/fake-llm-upstream.ts`：**OpenAI 兼容假上游**，监听 127.0.0.1，记录每次出站请求体，按脚本返回（首轮带一次 `tool_calls`，让工具循环真的转起来）。
- 新增 `tests/integration/production-entry-conversation.integration.test.ts`：起真实 `createServer` → 建会话 → 打 `POST /api/conversations/:id/messages` → 断言 HTTP 与 SSE 正常收束、假上游收到 ≥1 请求、工具被真实执行。
- 证据落盘 `docs/synova/product-lines/evidence/D817-capture-20260918.json`：含出站 body 的 `Object.keys()`（P0-1 的机器判据来源，取代"静态证据链"）。
- **P0-1 证词**：一条 `it.fails` 断言「出站 body 含 `tools`」——当前预期失败；P0-1 修好后它必然翻转 → 强制删除并改成正向断言（不让缺陷静默存在）。
- 上游指向：走既有配置缝（`createProvider(type, config).baseUrl`，`src/providers/index.ts:54-59`；装配点 `src/providers/registry.ts:144`；env 读点 `src/providers/detect.ts:22`）。**若既有缝不足以指向假上游 → 停手报阻塞**，不得在 `src/**` 加测试专用分支。

## 相关 D#

- 本卡：D817
- 直接解锁：P0-1/P0-2（tools 进请求体 + tool_call_id）、P0-4（不变量机制：第一条断言"发出去的请求 == 日志重建的请求"）
- 全部 15 项任务书验收（数据与可观测层 6 项 + 基础设施与信任层 8 项 + 自研缺陷 12 项中的接线类）
- 依据计划: v1.2@4e46603f（`docs/synova/coordination/整体推进计划-主线-20260913.md`）
