# SYNOVA-IMPL-D583：专家测试债对齐 v2.0 七专家（旧专家名测试更新）

> 状态：dev doc | 2026-09-06 | 优先级 P0
> 归属：Claude 线（诊断体系/专家层，Codex 写 dev doc）
> 借鉴：无（纯测试名对齐，不引代码）

## 1. 权威文档引用

- `expert/expert-registry.yaml` v2.0（D282）：7 位专家 `host / capital-cycle / customer-cycle / talent-cycle / tech / finance-structure / competitive-strategy`；旧 7 位 `strategy / org / finance / marketing / action / business_model / knowledge` 已移 `expert/_deprecated/`。
- 专家架构研究（`docs/synova/research/专家架构重定义与权威口径审计-20260905/` §6.6）：专家名禁含 cycle；问题域专家 = 资金效率/客户增长/组织能力/技术底座/竞争战略。

## 2. 代码审计现状（全量 vitest 实测，file:line）

`npx vitest run` 实测 74 文件失败/129 测试失败，其中「旧专家名测试债」为 Claude 线 P0，共 6 个测试文件仍断言 D282 已删专家：

| 测试文件 | 失败点 | 根因 |
|---|---|---|
| `tests/expert/analytical-lens.test.ts` | `EXPERTS = ['finance','strategy','org','marketing','tech','action','business_model','knowledge','host']`（9 旧）| 旧专家 `expert/<name>/IDENTITY.md` 已不在 |
| `tests/experts/d64-knowledge-files.test.ts` | `expert/marketing/TOOLS.md`、`expert/strategy/KNOWLEDGE.md`、`expert/org/KNOWLEDGE.md`、`expert/finance/KNOWLEDGE.md` | 旧专家文件已移 `_deprecated/` |
| `tests/expert/org-theory-injection.test.ts` | `resolve(__dirname,'../../expert/org/THEORY.md')` | org 已改 talent-cycle |
| `tests/agent/expert-file-loader.test.ts` | mock 用 `strategy/org/...` 旧名 | loader 已读 registry 7 位 |
| `tests/agent/expert-file-loader.integration.test.ts` | 断言「8 位专家」「strategy 专家」 | D282 9→7 后实为 7 位 |
| `tests/expert-quality/layer2-judge.test.ts` | `EXPERT_TYPES = ['strategy','org','finance','tech','marketing','action','business_model']`（7 旧，无 host）| 旧专家枚举；且该测试是 LLM 集成（需 LLM_API_KEY），改名后仍需 key 才通过 |

## 3. 写集表（6 修改 + 0 新建）

| 文件 | 操作 |
|---|---|
| `tests/expert/analytical-lens.test.ts` | 修改：EXPERTS 9 旧 → 7 当前 |
| `tests/experts/d64-knowledge-files.test.ts` | 修改：旧专家路径 → 当前专家路径（含对应内容断言） |
| `tests/expert/org-theory-injection.test.ts` | 修改：`expert/org/THEORY.md` → `expert/talent-cycle/THEORY.md` |
| `tests/agent/expert-file-loader.test.ts` | 修改：mock 旧名 → 当前 7 位 |
| `tests/agent/expert-file-loader.integration.test.ts` | 修改：「8 位专家」→「7 位专家」+ strategy → 当前名 |
| `tests/expert-quality/layer2-judge.test.ts` | 修改：EXPERT_TYPES 旧 7 → 当前 7（host 除外按 6 推理专家 + host 主持）；注：仍 LLM-key 依赖 |

## 4. 测试要求（red→green，非空壳）

- 修复前 red：上述 6 文件在 `npx vitest run` 下 FAIL（已实测）。
- 修复后 green：`npx vitest run tests/expert/analytical-lens.test.ts tests/experts/d64-knowledge-files.test.ts tests/expert/org-theory-injection.test.ts tests/agent/expert-file-loader.test.ts tests/agent/expert-file-loader.integration.test.ts` 全绿。
- `layer2-judge.test.ts`：改名后仍因 LLM_API_KEY 缺失而 fail（环境依赖），不计入本次 green 断言；如无 key 应 skip/标注，不改其 LLM 集成语义。

## 5. 接线要求

纯测试改动，无生产 export/接线变更。改后 `grep -rn "expert/\(strategy\|org\|finance\|marketing\|action\|business_model\|knowledge\)/" tests/` 零残留（旧专家路径只在 `_deprecated` 语境）。

## 6. 完成标准

1. 6 文件旧专家名全部对齐 7 位当前专家
2. 上述 5 个单测文件 `npx vitest run <5文件>` 全绿
3. `grep -rn "'strategy'\|'org'\|'finance'\|'marketing'\|'action'\|'business_model'\|'knowledge'" tests/expert tests/experts tests/agent/expert-file-loader*` 仅剩「_deprecated/旧专家归档」合理残留
4. tsc 零新增（测试改不动 tsc 28 基线）

## 7. 自检清单

- [ ] 7 位当前专家名 grep 实证（expert-registry.yaml 键）
- [ ] 旧专家路径 grep 残留检查
- [ ] 5 单测文件 red→green 实测
- [ ] 不是凭记忆
- [ ] 不用 --no-verify
