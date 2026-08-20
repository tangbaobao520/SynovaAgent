# TASK-DRAFTS.md — 文档体系收尾任务草稿（开发线即开即用）

> 用途：以下任务 brief 已按 task-start 6 字段模板写好；创始人批准后即可开工。
> 来源：`docs/authority/DRIFT-LEDGER.md` + `docs/authority/GOVERNANCE.md`（机制接线）
> 准备：2026-08-20 | DSH 架构线
> **执行状态：任务 A ✅ 已完成（2026-08-20，真相验证全绿）；任务 B ✅ 已完成（2026-08-20，UNK 50→48，2 份归档）；任务 C ✅ 已完成（2026-08-20 创始人批准，门禁已接线 pre-commit）**

---

## 任务 A：CLAUDE.md / LOOP.md 漂移同步（真相验证 C2/C3 归零）

```
## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
check-doc-truth.sh（scripts/doc-system/，2026-08-19 已实施）检出 3 处文档-事实漂移：
- CLAUDE.md Loop Engineering 章节声明 "pre-commit 8 组"（V3.7 时代内容），实际 pre-commit-check.sh 自声明 13 组
- LOOP.md 声明 "8 组硬阻断"，实际 13 组
- LOOP.md 头部版本 V4.4.5，AGENTS/CLAUDE 均为 V4.5.1
### b) 文件审计
- grep "8 组" CLAUDE.md LOOP.md → 定位所有旧声明
- AGENTS.md 已有 V4.5.1 的 13 组表（权威对照）
- 改动文件：CLAUDE.md、LOOP.md
### c) 决策
以 pre-commit-check.sh 自声明（13 组）与 AGENTS.md 为真相；CLAUDE.md 整章同步到 V4.5.1
（不是单纯改数字——Loop Engineering 章节描述 V3.7 机制，需对照 AGENTS.md 更新表格与流程描述）

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 教训：V4.4.4 曾因"只改版本号不改内容"导致漂移复发（CLAUDE.md changelog 有记录）
- 教训：文档-代码漂移是本项目反复事故（AGENTS/CLAUDE/LOOP 三份手抄同一事实）
- 单一真相源：CLAUDE.md 的 Loop Engineering 章节应向 AGENTS.md 看齐，避免继续手抄

## Q2: 范围 — 正确的最简方案
做什么：
1. CLAUDE.md：Loop Engineering 章节更新为 V4.5.1（13 组表、流程描述），版本号保持 V4.5.1
2. LOOP.md：组数 8→13、版本 V4.4.5→V4.5.1，内容对照 AGENTS.md
3. 重跑 `bash scripts/doc-system/check-doc-truth.sh` → 硬检查全绿（exit 0）
不做什么（含文件路径）：
- 不改 AGENTS.md（已是权威）
- 不动 pre-commit-check.sh（门禁脚本另走任务 C）
- 不改历史文档（docs/ 下的旧报告保持原样）

## Q3: 验收 — 入口 → 交互 → 结果
入口：`bash scripts/doc-system/check-doc-truth.sh`
处理：修复 CLAUDE.md/LOOP.md 后重跑
结果：C2（组数）×3 文件 + C3（版本）×3 文件 全部 ✅，exit 0；
      `bash tests/doc-system/check-doc-truth.test.sh` 5/5 通过

## 架构层: L0（文档体系，非代码层）
## Done 标准: check-doc-truth.sh 硬检查全绿 + 测试 5/5 + DRIFT-LEDGER 待修复 3 项标记完成
```

---

## 任务 B：triage UNK 45 份定性 + 归档执行（一次性清理收尾）

```
## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
doc-triage.sh（2026-08-19 已实施）盘点 537 份 md：KEEP 15 / ARCH 24 / NEW 448 / UNK 45 / DEL 0。
UNK 45 份待人工定性（多为 6-7 月实现文档、审计计划、根目录散件）。
### b) 文件审计
`bash scripts/doc-system/doc-categories.sh` 输出九类归位（603 文件），UNK 主要在
unclassified（45）+ draft（37）两个桶
### c) 决策
按九类沉淀索引逐份定性：保留（research/devdoc/decision 类）→ 不动；
过时实现文档 → docs/archive/ + 墓碑；重复/废弃 → 删除（先 git 确认无引用）

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- Novis 时代 Archive 已有 433+ 过期文档的教训：没有归档机制 → 文档膨胀
- 铁律 37：Dead code 入仓库即违规；文档同理

## Q2: 范围 — 正确的最简方案
做什么：
1. 对 UNK 45 份逐一定性（保留/归档/删除三选一），产出清单
2. 归档候选移入 docs/archive/ 并立墓碑（README 或索引记录）
3. 确认删除的走 git rm
不做什么（含文件路径）：
- 不动 docs/authority/（权威层）
- 不动被 AGENTS/CLAUDE/权威层引用的文档（KEEP 15）
- 不批量删除——每份删除需在清单中写明理由

## Q3: 验收 — 入口 → 交互 → 结果
入口：`bash scripts/doc-system/doc-triage.sh`
处理：定性 + 归档 + 删除
结果：UNK 归零；triage 报告 UNK=0；归档区有墓碑；删除项 git log 可追溯

## 架构层: L0（文档体系）
## Done 标准: doc-triage.sh 报告 UNK=0 + 归档墓碑存在 + 删除有 git 记录
```

---

## 任务 C：doc-system 门禁接线 pre-commit（最高风险变更，需创始人批准）

```
## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
将 scripts/doc-system/ 的 check-doc-truth.sh（真相验证）与 doc-registry-gate.sh（登记门禁）
挂进 pre-commit-check.sh（新增组或并入现有组），让文档漂移/未登记在提交时物理阻断。
### b) 文件审计
- scripts/pre-commit-check.sh：现有 13 组结构（组 1-10, 12, 13），有 par_start/par_collect 并行框架
- scripts/doc-system/：5 个脚本已独立可跑（测试 44/44）
### c) 决策
⚠️ 最高风险变更：改门禁脚本 = 全线误拦/漏拦（历史 D328-D335 P0 一半出在控制塔）。
必须：task brief + 独立测试 + K3 审计线复核 + 先在本地验证不误拦存量提交

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- ctrl-tower-change skill：门禁脚本变更模式库（改 scripts/control-tower、pre-commit-check.sh 必读）
- windows-compat skill：subprocess/PATH/UTF-8/静默吞错
- 教训：pre-commit 曾 122s 超时导致 --no-verify 绕过（V4.5.1 根治）——新检查必须 <10s
- 教训：误报产生噪音 → 噪音导致门禁被绕过

## Q2: 范围 — 正确的最简方案
做什么：
1. pre-commit-check.sh 新增组（或并入组 8 文件驱动）调用两个脚本，仅对
   docs/、AGENTS/CLAUDE/LOOP、权威层相关文件变更时触发
2. 断言：doc-system 脚本本身改动不触发自身（防自锁）
3. 计时 <10s（两个脚本真实仓库实测 0.4s + 0.6s）
不做什么（含文件路径）：
- 不改 scripts/doc-system/ 脚本逻辑（已稳定）
- 不做全量文档强制登记（存量 45 UNK 未定性前，门禁只管新增）

## Q3: 验收 — 入口 → 交互 → 结果
入口：git commit（携带文档变更）
处理：pre-commit 触发 check-doc-truth + doc-registry-gate
结果：漂移/未登记 → 提交被拒（提示修复）；干净 → 放行；git commit 全程 <10s

## 架构层: L0（门禁体系）
## Done 标准: 带文档漂移的提交被硬阻断 + 干净提交放行 + 计时 <10s + K3 审计通过
```

---

*3 个草稿经创始人批准后即可复制到 .claude/task-briefs/ 开工。*
