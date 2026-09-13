# D744: gen-cto-health.py 崩溃 + FAIL 判定被吞（P0）

> 派单: CTO「第 1 项」—— ① :305 spec 两态兼容 ② :326-331 FAIL 判定（PASS 子串优先吞掉 FAIL）③ 反向验证 ④ D600 后同类 str spec 一并兼容
> 取号: D744（main 最大 D741；D742/D743 已被 CTO 预留 → 取 D744。分配器跨分支缺陷见 D737 退回记录）
> 红线: 不改 scripts/audit/ ✅ · 不碰 ci.yml ✅

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔健康仪表盘生成器（`docs/synova/CTO-HEALTH.md` 的 AUTO 区）。CTO 开工先读此文件 → 判定错误 = **CTO 看到假绿**，属最高影响面的一类缺陷。
### b) 文件审计
崩溃已精确复现（下方 §验收）。`grep -rn "gen-cto-health" scripts/ tests/` 既有 `tests/control-tower/gen-cto-health.test.sh` 与 `gen-cto-health.py`（本任务修后者）。④ 实测全仓 `task-state/D*.json` 中 `spec` 为 **str** 的只有 `D600.json` 一个。
### c) 决策
已有覆盖→复用既有 test 文件做回归。无覆盖→改两处判定。冲突→无。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
业界: 解析「判定」必须找**判定字段/行**，不能对全文做子串匹配 —— 报告正文的证据行天然同时含 PASS 与 FAIL（本项目实证：`PASS:3 WARN:883 FAIL:435`），全文子串是经典的假绿来源。Anthropic 工程基线: ① 机器可验（判定必须可复现）；② 不静默降级（兼容历史格式不得放松校验）；③ 反向验证。memory: D395a（verdict 优先序原始定义）、D412（不可读不计真）、D399/D400（衍生判定工件优先）、铁律 37（兼容不等于放宽）。
Q1c 决策参考系: 参考 Anthropic（机器可验 + 反向验证）+ 第一性原理（「谁是判定」应看结论行，而不是看全文出现过什么词）+ 开源实证（CI 判定普遍取 exit code/结论字段而非日志子串）。结论: 收敛 —— 两层修法：① 结论行优先 ② 同作用域内 FAIL 先于 PASS（CONDITIONAL PASS 仍最高）。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/control-tower/gen-cto-health.py（改：① spec str/dict 两态 ② verdict 结论行优先 + FAIL 先于 PASS）
- docs/synova/CTO-HEALTH.md（生成产物，随修复重生成）
- tests/control-tower/gen-cto-health.test.sh（**不改**——已存在且本次回归须全绿）
- task-state/D744.json + 本 brief + memory Note
不做什么：
- 不改 scripts/audit/audit-rules.sh（K3 审计红线，禁碰）
- 不改 scripts/product-lines/calc-progress.py（第 2 项的范围，本项不预动）
- 不改 scripts/control-tower/founder-truth.py（别的消费端，第 2 项统一处理）
- 不改 .github/workflows/ci.yml（红区，批 C 归 CTO）

## Q3: 验收 — 入口 → 交互 → 结果
入口: `python3 scripts/control-tower/gen-cto-health.py`
处理: 扫 task-state（spec 两态）→ 解析每任务审计报告（结论行优先取判定）→ 生成 CTO-HEALTH.md AUTO 区
结果: exit 0；报告内失败项以 FAIL 呈现（修复前 D393 等被 PASS 子串吞掉）

## 架构层: 基础设施
控制塔仪表盘生成器（scripts/control-tower/），不进运行时链路：不 import src/、不 import packages/、零跨层。

## Done 标准: 物理命令断言（每条可直接跑，exit 0 = 达标）
- [ ] DS1: `python3 scripts/control-tower/gen-cto-health.py` → **exit 0**（修复前 AttributeError 崩溃 exit 1）
- [ ] DS2: 输出含失败项: `grep -cE '\| FAIL \|' docs/synova/CTO-HEALTH.md` ≥ 1（实测 34）
- [ ] DS3: D393 呈现 FAIL: `grep -E '\| D393 \|' docs/synova/CTO-HEALTH.md` 第 6 列为 FAIL
- [ ] DS4: 反向验证（退化为全文作用域）→ D503/D515/D549/D572 变 CONDITIONAL_PASS、FAIL 行数由 34 降到 14
- [ ] DS5: ④ spec 为 str 的历史任务兼容: `task-state/D600.json` 的 spec(str) 不再触发崩溃
- [ ] DS6: 既有回归: `bash tests/control-tower/gen-cto-health.test.sh` exit 0
- [ ] DS7: `SYNO_CI=1 SYNO_DIFF_BASE=origin/main bash scripts/pre-commit-check.sh` + `bash scripts/control-tower/simulate-ci.sh` 均 exit 0
