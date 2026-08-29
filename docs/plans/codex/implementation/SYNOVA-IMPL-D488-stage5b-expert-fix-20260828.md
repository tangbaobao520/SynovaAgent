<!--
  SYNOVA-IMPL-D488: full-pipeline Stage 5b 专家数断言修复（D282 9→7 迁移后过时）
  状态: dev doc | 2026-08-28 | 优先级 P2
  切片: 无（独立小任务，D480 审计遗留收尾）
  权威文档: expert/expert-registry.yaml v2.0（D282: 9→7 迁移，2026-07-30——声明式专家配置，加专家=加条目+目录）; tests/e2e/full-pipeline.integration.test.ts L201-207（Stage 5b 断言）; D480 交付报告（full-pipeline Stage 5b 基线失败——expert/ 布局演进，已上报未修）
  依赖: 无
  并行: 写集=tests/e2e/full-pipeline.integration.test.ts，与 D487（GA 诊断事件化，src/agent+store）**零交集**——可并行（V5.2.0 clone 模型各自隔离）；与 DSH 线（scripts/、src/sentinel/）零交集
  借鉴: 无 DSH 迁移直接借鉴项（测试断言修复，自有）
-->

# SYNOVA-IMPL-D488 full-pipeline Stage 5b 专家数断言修复

## 1. 权威文档引用

* **expert-registry.yaml v2.0**（expert/expert-registry.yaml，D282 2026-07-30）："9→7 迁移"——移除 strategy/org/finance/marketing/action/business_model/knowledge，新增 capital-cycle/customer-cycle/talent-cycle/finance-structure/competitive-strategy；**7 位专家是当前正确数**（host/capital-cycle/customer-cycle/talent-cycle/finance-structure/competitive-strategy/tech）；声明式配置（加专家=加 yaml 条目+目录，自动注册）。
* **Stage 5b**（tests/e2e/full-pipeline.integration.test.ts L201-207）："专家加载—所有 9 位专家 manifest + PROMPT.md"，L207 `expect(experts.length).toBeGreaterThanOrEqual(9)`——**D99 时代硬编码 9，D282 迁移后未更新 → 恒失败**（实测 expert/ 7 个真实专家目录）。
* **D480 交付报告**（K3 可核）："full-pipeline Stage 5b（expert/ 目录 ≥9 断言，实测 7）为 origin/main 既有失败，CI 本就排除 tests/e2e/**"——已上报未修。

## 2. 代码审计——现状（全部实测 file:line）

### 缺陷：Stage 5b 断言硬编码 9，与 D282 迁移后的 7 位专家不符
* `tests/e2e/full-pipeline.integration.test.ts` L207：`expect(experts.length).toBeGreaterThanOrEqual(9)`——硬编码 9。
* expert/ 目录实测（git ls-tree HEAD expert/）：7 个真实专家目录（capital-cycle/competitive-strategy/customer-cycle/finance-structure/host/talent-cycle/tech）+ `_deprecated`/`_template`（L206 过滤器 `!e.name.startsWith('_')` 排除）→ **L207 恒失败**。
* `expert/expert-registry.yaml` v2.0：声明式专家清单（enabled: true 的 7 位）——**动态断言依据**（专家数变化时 yaml 自动反映，测试不再漂移）。
* full-pipeline 为 e2e（CI 排除 tests/e2e/**，D480 确认）——验收本地跑。

### 无重复造轮子审计（S-14，2026-08-28 实测）
* Stage 5b 修复无既有任务（git log 该测试文件：D99 创建/D99-FIX 升级/D317 清理——**无 D282 后更新**）；D480 仅上报未派发。
* 动态读 yaml 的范式：`expert/expert-registry.yaml` 是唯一专家声明源（无第二份清单需同步）。
* DSH 迁移：测试断言修复，自有领域，无借鉴项。

## 3. 实现方案

### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| tests/e2e/full-pipeline.integration.test.ts | 修改 | L201-207 Stage 5b 断言改为**动态读 expert-registry.yaml**：解析 yaml 中 `enabled: true` 的专家数（预期 N）→ `expect(experts.length).toBe(N)`（N=yaml 实读，当前 7）+ 注释标注"D282 9→7，动态断言防再漂移"；manifest/PROMPT.md 校验循环保持 |

> 共享资源标注（S-8）：本写集不含 VERSION.md（测试断言修复，非门禁/工具行为变化，不 bump）；current-brief / 暂存区共享；与 D487 零交集。

### 3.2 最终实现同 commit 回填
若实现偏离方案（如 yaml 解析用现有 yaml 库而非手写解析、或断言改为 >=7 而非动态读、或 expert 目录扫描含子目录差异），必须在本节同 commit 回填最终形态（S-6）。

### 3.3 不做的事
* 不改 expert/ 目录与 expert-registry.yaml（7 位专家是 D282 定稿，正确）。
* 不改其他 Stage（5a 等——已绿）。
* 不碰 DSH 线（scripts/、src/sentinel/、electron/）。

## 4. 测试要求（测试优先：红 → 绿）

| 层 | 类型 | 数量 | 覆盖 |
|----|------|------|------|
| E2E | tests/e2e/full-pipeline.integration.test.ts（修改 Stage 5b） | 1（Stage 5b）+ 全 pipeline 回归 | Stage 5b：专家目录数 == yaml enabled 数（red=当前 9 断言 vs 7 实测失败 → green=7==7）；manifest/PROMPT.md 校验循环保持 |

**RED 必须覆盖失败模式（S-5）**：以现状断言——L207 `>= 9` 实测失败（7 专家，red）→ 修复后动态读 yaml（7==7，green）。若未来专家数再变，测试自动跟随 yaml（不漂移）。

## 4.5 决策参考（S-12）
* 决策点 1：硬编码 7 vs 动态读 yaml？
  * 参考系：第一性原理——专家清单是声明式配置（yaml 唯一源）；硬编码 7 会在未来专家数变化时再漂移（9→7 已踩一次）；动态读 yaml = 测试与声明源单一事实对齐。
  * 结论：动态读 expert-registry.yaml（enabled: true 专家数）。
* 决策点 2：yaml 解析方式？
  * 参考系：Anthropic——最小依赖：测试内轻量解析（正则提取 `enabled: true` 的专家条目）或复用仓库既有 yaml 解析；不新增重型依赖。
  * 结论：轻量解析（按专家条目计数），实现时确认仓库 yaml 解析库（§3.2 回填）。

## 5. 接线要求

| 新 export/函数 | 调用方 | 确认方式 |
|---------------|--------|---------|
| 无新 export（测试断言修复） | full-pipeline Stage 5b | `grep -n "expert-registry" tests/e2e/full-pipeline.integration.test.ts` 命中（yaml 动态读取） |

> 本任务无生产代码新增（纯测试断言修复）。

## 6. 完成标准

* **DS1 动态断言**：`grep -n "expert-registry" tests/e2e/full-pipeline.integration.test.ts` 命中（yaml 读取）。
* **DS2 断言对齐**：`grep -n "toBe(N)\|expect(experts.length)" tests/e2e/full-pipeline.integration.test.ts` 命中（动态 N 断言，非硬编码 9）。
* **DS3 测试全绿**：本地 dev server 运行态 `npx vitest run tests/e2e/full-pipeline.integration.test.ts` 全 pass（含 Stage 5b；red 先行 9 断言失败已证）。
* **DS4 零回归**：`vitest run tests/e2e/customer-flow.e2e.test.ts tests/agent/diagnosis-launcher.test.ts` 绿 + `tsc --noEmit` 零新增（30=30）。
* **DS5 范围一致**：`git diff --name-only HEAD^` 与 §3.1 写集一致（1 文件 + 簿记），无越界。
* **DS6 无绕过**：`grep -n "no-verify" .claude/bypass.log` 零命中。
* **DS7 推送 + CI**：`git push` 后 `git log origin/main..HEAD --oneline` 空 + CI 任务相关 job 绿（e2e 本身本地验证，交付报告留 server 启动证据）。

## 7. 自检清单

* [ ] 每个代码审计 claim 有 file:line 证据（§2 实测 grep，不是凭记忆）
* [ ] 写集表标题后紧跟表格（无空行）
* [ ] 测试 red→green 覆盖失败模式（9 断言失败 → yaml 动态 7 绿；防再漂移）
* [ ] 接线/边界真实（expert-registry.yaml 唯一源 + 不碰其他 Stage）
* [ ] DS verify 命令真实可执行（e2e 本地 server 跑）
* [ ] 版本编排：测试断言修复，非门禁/工具行为变化，不 bump VERSION.md
* [ ] 不用 --no-verify

## 8. 交付声明（声称↔证据对照表，U4 D423）

| 声称 | 证据命令 | 预期 |
|------|---------|------|
| DS1 动态断言 | grep -n "expert-registry" tests/e2e/full-pipeline.integration.test.ts | 命中 |
| DS2 断言对齐 | grep -n "expect(experts.length)" tests/e2e/full-pipeline.integration.test.ts | 动态 N（非硬编码 9） |
| DS3 测试全绿 | npx vitest run tests/e2e/full-pipeline.integration.test.ts（server 运行态） | 全 pass（非 skip） |
| DS4 零回归 | vitest run tests/e2e/customer-flow.e2e.test.ts tests/agent/diagnosis-launcher.test.ts + tsc --noEmit | 全绿 + 零新增 |
| DS5 范围一致 | git diff --name-only HEAD^ | 与写集一致 |
| DS6 无绕过 | grep -n "no-verify" .claude/bypass.log | 零命中 |
| DS7 推送 + CI | git log origin/main..HEAD --oneline | 空（推送后） |

---

> 交付声明 DS 须与本文档 DS1-DS7 一一对应（S-10）；派发说明：**与 D487（GA 诊断事件化）可并行**（写集零交集，V5.2.0 clone 模型各自隔离）——任务开工 `git clone --local <主工作区> .sessions/<sid>/repo && bash scripts/install-hooks.sh`，禁止在主工作区写代码；**动态读 expert-registry.yaml（enabled: true 专家数），不硬编码 7/9**；full-pipeline 为 e2e（CI 排除），验收本地 dev server 跑 + 交付报告留证据；暂存前查 session-registry（S-9）+ 主树占用检测（V5.0.0 项1）；merge main 时 reference-map 冲突由本任务所有者解决、bypass.log 噪声行不提交。
