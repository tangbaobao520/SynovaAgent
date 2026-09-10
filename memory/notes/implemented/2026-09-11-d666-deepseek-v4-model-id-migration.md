---
状态: implemented
日期: 2026-09-11
决策: DeepSeek 模型标识符代际迁移——仓库内 31 处 `deepseek-chat` → `deepseek-v4-flash`（16 文件：默认配置常量 / 测试环境变量回退 / 桌面端表单预填与占位符 / CLI 帮助文案 / JSDoc 示例 / 测试夹具与断言）；`src/services/llm-cost.ts` 的 `'deepseek-chat'` 与 `'deepseek-reasoner'` 两个**定价表别名键刻意保留**——它们是成本查询的向后兼容层，非「当前模型」声明，删除会让存量凭据/历史记录的成本查询静默掉进 `default` 分支（铁律 11 静默降级）。
理由: ① 代际一致性——DSH 侧 `~/.dsh/settings.yaml` 的 `llm-deepseek.models` 已于 2026-09-10 切 V4 命名，仓库侧沿用上一代别名造成两侧漂移；② 前瞻命名——2026-09-10 实盘 api.deepseek.com 验证真实 id 仅 `deepseek-flash` 与 `deepseek-v4-pro`，`deepseek-v4-flash`/`deepseek-chat`/`vision-exp` 当前都解析到同一后端 `deepseek-flash`，故本迁移**今日行为等价、官方切后端后自动生效**；③ 别名键保留——成本表是查询侧兼容层，与生产侧「当前模型」声明职责不同，不可一并替换。
---

## 背景

DeepSeek 官方把模型代际命名从 V3/V41 体系切到 V4 体系。DSH 内核
`dsh-llm-deepseek` 的 `DEFAULT_MODELS` 已列 `deepseek-v4-flash` / `deepseek-v4-pro` /
`deepseek-v4-flash-vision-exp`；DSH 侧配置已于 2026-09-10 完成切换并隐藏上一代
V41（`deepseek-flash` / `DeepSeek-V41-Flash`）。

仓库侧仍留 28 处 `deepseek-chat`，形成两侧命名漂移。全仓库 survey（排除
node_modules/.git/dist）后逐处定性，确认其中 27 处属「当前模型声明」语义，
1 处（`src/services/llm-cost.ts`）属「查询兼容别名」语义。

## 决策

**替换（27 处 → 31 处，含测试夹具与断言）**

| 类别 | 文件 |
|---|---|
| 默认模型常量 | `src/config-file.ts`、`src/mvp-server.ts`、`mvp-server.cjs`、`synova.json` |
| 测试环境变量回退 | `tests/run-experts-real.ts`、`tests/run-e2e-pipeline.cjs`、`tests/expert-quality/layer2-judge.test.ts` |
| 桌面端表单 | `electron-renderer/src/components/WelcomeScreen.tsx`、`LlmSetupCard.tsx` |
| CLI 帮助文案 | `src/cli/commands/config-cmd.ts` |
| JSDoc 示例 | `src/orchestrator/context-compressor.ts` |
| 测试夹具/断言 | `tests/routes/llm-config.test.ts`、`tests/llm-config-frontend.test.ts`、`tests/services/context-budget-tracker.test.ts`、`tests/services/llm-credential-store.test.ts`、`tests/orchestrator/context-compressor.test.ts` |

**保留（2 处别名键）**

`src/services/llm-cost.ts` 的 `'deepseek-chat'` 与 `'deepseek-reasoner'` **不动**。
定价表是**查询侧**结构：已存量的 `llm-credential-store` 记录与历史调用统计里仍可能
带旧 id，键删除后这些查询会静默落到 `default: { input: 1.0, output: 2.0 }`——
数值恰好相同掩盖了失效，正是铁律 11 所禁的静默降级。同表已有 `deepseek-v4-flash`
键，新 id 直接命中，无需改动。

## 波及面与验证

- **不改**：`package.json`/`package-lock.json`（无依赖变更）、`scripts/`（审计红线）、
  `packages/engine-core/`（铁律 46）、DSH 侧文件（独立变更已完成）、
  `docs/synova/coordination/dsh-*-draft/` 预设源（独立 PR）。
- **验证方式**：全量 `vitest run` 与**未改动的 `origin/main` 基线 clone 逐文件比对**，
  确认失败清单无新增。实测结论：8 个失败文件中 7 个在基线上同样失败（存量红，
  与本迁移无关）；`tests/stream-tool-loop.test.ts` 经 3 次重复实测确认为 **flaky**
  （真实 LLM 调用泄漏进 mock 测试，基线同 flaky，表现为「通过/失败/失败」交替），
  非本迁移引入。
- **实盘可达性**：`deepseek-v4-flash` 对 api.deepseek.com 调用成功，响应
  `"model": "deepseek-flash"`（别名解析），确认迁移不破坏调用链。

## 遗留

- `tests/stream-tool-loop.test.ts` 的 flaky（mock provider 未拦住真实 LLM 调用）
  属既有缺陷，未在本任务范围内修复，建议另行立项。
