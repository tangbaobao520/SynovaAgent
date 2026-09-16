# D791: 线 3 报告体系 spec（一页纸四槽位 + 各维度循环结论 + 结论可溯源）

> 派单: docs/synova/coordination/派单-批六首批三卡-20260916.md 卡 2（域: win；dev-doc session 产出 spec）
> 基线: origin/main @ 6a06e853（worktree `.synova-wt-d791` / 分支 feat/d791-line3-report-spec）
> 交付三件: spec + 编码指令 + task-state 回填（缺一不可）

#CRITERIA: A

## 域
win（代行期 Mac 侧执行，域声明不变；产物 = docs/plans/** spec + docs/synova/coordination/ 编码指令 + task-state/）

## 主线贡献: line-3/3-1,3-7
（支柱②「报告可溯源」：一条诊断报告能溯源到 ≥1 条原始证据）

## Q0: 定位 — 项目拼图 + 文件审计
L1 交互 + L2 编排 + L3 洞察三层的「报告最后一公里」。该层现有：src/agent/report-assembler.ts（D480 一页纸渲染，3 处生产调用点）、src/l3/report-templates.ts（executive_summary 模板）、src/cycles/（6 循环 + 溢出仪表盘，报告侧零消费）、src/agent/sentinel-service.ts（findings 只读面）、src/routes/diagnosis.ts（报告生产入口）。本任务**只写 spec**（不写实现）：spec 覆盖一页纸信息架构（四槽位）、数据来源与溯源指针、3-7 循环结论派生（零新指标）、GS-08 改造与兑换链路。文件审计实测：`buildCycleConclusions` / `report-onepager-trace` 全仓零命中（新建）；GS-08 证据实测三份 verdict=pass 但落在 calc-progress 不扫的目录且验收点 id 写成 S8-x → 「绿了不算分」（spec §4 缺陷 A/B 实测，base 6a06e853）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
业界: BLUF/金字塔四件套（结论/证据/分维度状态/行动）+ 证据必须可回查。Anthropic: fail-closed + 机器可验契约（assert.ts 只认物理输出；检查未执行 ≠ 检查通过）。memory: 接线失败 4 次（新 export 必须真实生产调用点）· D286 写集漂移 16/17 · D480 三槽位无证据槽/循环槽 · D749/D750 假绿（fail-open）· D595 骨架 brief 属交付缺陷。DSH 基线实测更正（2026-09-17）: 本机 DSH = 0.1.5-rc.2 / 241 包，旧图纸（20260820 / 09-07）描述已落后 → 本 spec 不引 DSH 侧描述，零 DSH 依赖。参考: Anthropic + DeepSeek + 第一性原理 + 结论: 四槽位 + ASCII 溯源指针 + 复用既有函数（零新指标）。

## Q2: 范围 — 正确的最简方案
做什么（本任务只写文档，下列为实现写集，spec §5.1 已逐条声明并给出 12 文件上限）：
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D791-line3-report-onepager-20260917.md
- docs/synova/coordination/编码指令-D791-线3报告体系-20260917.md
- task-state/D791.json
- .claude/task-briefs/2026-09-17-D791-line3-report-spec.md
不做什么：
- 不写实现代码、不改 src/l3/report-templates.ts（实现属后续编码 session，spec §5.1 声明）
- 不改 src/agent/report-assembler.ts（同上，spec 声明为修改项，本任务不动）
- 不改 scripts/golden-scenarios/GS-08-report-readable/run.sh（实现期改造，本任务只写验收契约）
- 不改 scripts/product-lines/calc-progress.py（D790 在飞，同目录串行）
- 不碰 scripts/audit/ 下任何文件（K3 专属红线）
- 不引 @deepseek-ai 运行时依赖（本任务零 DSH 依赖）
- 不改 .github/workflows/ci.yml（CI 冻结）

## Q3: 验收 — 入口 → 交互 → 结果
入口: bash scripts/control-tower/dev-doc-gatekeeper.sh <spec>（C1-C6 结构门禁）。
处理: 11 节逐节写（Authority / Problem / Q0-Q4 / Current State 实测 / What We Build 写集表 / What We Don't Do / Test Requirements L1-L2c / Wiring Verification / Architecture Layer / Completion Standard DS1-DS14 / Auth Doc References）+ 北星 front-matter + 编码指令 7 段 + task-state spec 段。
结果: ① gatekeeper exit 0；② 写集核验 0 漂移；③ 编码指令全文可转发；④ task-state/D791.json status=spec_done；⑤ 实现 session 拿到 spec 即可开工（不需追问）。

## 架构层: L1 + L2 + L3
spec 覆盖：L1 报告读取端点（src/routes/diagnosis.ts）→ L2 报告装配与循环派生（src/agent/）→ L3 模板版式（src/l3/report-templates.ts）。文档本身不含代码；架构约束（L2→L4 硬门 + L1 类型位置豁免）已在 spec §4/§9 实测登记（scripts/check-architecture.sh:44-48 / :92-95 + src/agent/loop-handlers.ts:670 先例）。

## Done 标准: 物理命令可验（非自述）
- [ ] DS1: `bash scripts/control-tower/dev-doc-gatekeeper.sh docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D791-line3-report-onepager-20260917.md` → exit 0（C1-C6 ALL PASS）
- [ ] DS2: `SYNO_DEV_DOC=<spec> bash scripts/workflow/check-dev-doc-write-set.sh <spec>` → 漂移 0（spec 期正向"声明未改"按 D593 先例由注入缝豁免，反向对账仍执行）
- [ ] DS3: 交付三件落盘（spec + 编码指令 + task-state/D791.json spec 段，status=spec_done）
- [ ] DS4: brief 无骨架（6 字段全填 + #CRITERIA + Q2 含具体文件路径，无 `<!--` 残留）
- [ ] DS5: 写集外零改动（`git diff --name-only` 与写集一致）+ scripts/audit/ 零触碰 + 零 DSH 依赖
