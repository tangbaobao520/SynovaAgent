# Task Brief: D392: npm audit 豁免落地 + D387 PASS 补核登记

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D392)
> 性质: 创始人裁决落地——npm audit 豁免（CI 黄灯）+ D387 补核转 PASS 登记

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
创始人裁决 npm audit 豁免（33 漏洞在 node-gyp 编译链 + 本地部署）。落地：CI workflow 改 continue-on-error（黄灯保留扫描）+ 台账/DASHBOARD 记录裁决。附带 D387 补核转 PASS 登记。

### b) 文件审计
- .github/workflows/ci.yml（audit job → continue-on-error + 注释）
- docs/synova/coordination/审计发现台账-DSH-CTO.md（D387 补核 + P2-5 + 豁免裁决）
- docs/synova/DASHBOARD-CN.md（待裁决区更新）
- .claude/task-briefs/2026-08-16-D392-audit-exempt.md
- task-state/D392.json

### c) 决策
创始人裁决豁免。参考：第一性原理（编译链漏洞 + 本地部署 = 攻击面不成立）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 裁决（创始人）→ ② CI 黄灯化 → ③ 台账/DASHBOARD 记录 → ④ 提交。
引用 D387 审计、P2-5。

### b) 执行约束
- rule: "CI npm audit 失败不阻断"
  verify: "ci.yml audit job continue-on-error: true"

### c) 决策参考系
参考：第一性原理。收敛。

## Q2: 范围 — 正确的最简方案

做什么：
- .github/workflows/ci.yml
- docs/synova/coordination/审计发现台账-DSH-CTO.md
- docs/synova/DASHBOARD-CN.md
- .claude/task-briefs/2026-08-16-D392-audit-exempt.md
- task-state/D392.json

不做什么：
- 不改 package.json / electron 版本（豁免 = 不升级）
- 不改 scripts/control-tower/check-secrets.sh

## Q3: 验收 — 入口 → 交互 → 结果

入口：CI npm audit job
处理：continue-on-error 黄灯 + 豁免注释
结果：CI 红减一（只剩 Architecture，D391 修复后全绿）；裁决可追溯

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] ci.yml audit job continue-on-error: true + 豁免注释
- [ ] 台账含「2026-08-16 创始人裁决豁免 + 触发升级条件」
