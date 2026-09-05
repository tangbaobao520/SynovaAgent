# 派单 — D579 FIX-D572：k3 verdict stale/TTL 机制 + 批次审计报告范围派生（产品线诚实化续篇）

> 派单: CTO | 2026-09-05 | 认领: DSH 编码线（scripts/product-lines 治理脚本，与 D576 同域；D576 已 close，本单为合法新 FIX）
> 来源: D572 K3 FAIL 的两个机制级 P1——**P1-1**: k3 pass 对 stale/TTL 检查永久免疫（D556 在证据日期后改 electron-renderer 452+193 行，线1 1-2/1-4/1-6 证据未失效）；**P1-3（机制侧）**: 批次审计报告文件名（D501-D550 型）派生不可见中间 D#，D517-519 verdict 滞留 CONDITIONAL 无从自动闭环。审计闭环铁律：另起 FIX 任务。
> 上一轮教训: D572 P0 假绿（兑换机制洗白 waiting）→ D576 修了兑换诚实化（CT-53）；本单补**时效性**缺口——证据会过时，机制必须知道。

## 写前核实（6 项，CTO 已核）

- ① 来源/依赖: D572 审计 P1-1/P1-3；D576（CT-53 兑换诚实化）已 close，本单接续其治理脉络
- ② task-state: D572 audited（FAIL）；D576 impl_done（audit 通道同批 D575-D577 审计派单）；本单 D579 alloc claimed
- ③ 基线资产（origin/main 实测，行号为 D576 合并后现值）: scripts/product-lines/calc-progress.py——**stale 机制已存在**（`git_touched_after` L106、`status_for_point` L130、`EVIDENCE_TTL_DAYS=14` L67、SIX_STATES 含 stale L69、失效检查生效点 L166「机器验证绿→待裁判；但先查失效」），**缺口=k3 分支 L147-149 在 L166 之前 return verified，一票翻绿绕过失效检查**；scripts/product-lines/redeem-progress.py（D576 改）；D556 变更 commit 69d81c58（git cat-file HIT）
- ④ DSH 借鉴核查: 无（本仓自有治理脚本演进；不涉 DSH 通用管道）
- ⑤ 写集重叠: D579 新号；calc/redeem 无其他在途认领（D576 closed）
- ⑥ 上一轮教训: D576（YamlSubsetError 字段名 acceptance_points 首踩即修；测试 mini yaml 模式）；D572「兑换不读 verdict 细则」——设计时先定义 verdict 语义表

## 任务定义

| # | 内容 | 对应发现 | 性质 |
|---|---|---|---|
| A | **k3 类证据 stale/TTL 接线**: 复用既有机制（`git_touched_after` L106 + TTL L67/L166），把 k3 分支（L147-149）纳入失效检查——k3 pass 在「证据日期后绑定模块有变更 / 超过 TTL」时同样落 stale，语义与 machine 类一致；验收点级模块归属映射缺失时的降级契约见 spec 必答 1 | P1-1（CT-55） | 主体 |
| B | **批次审计报告范围派生**: audit-reports 文件名含 `D501-D550` 型范围时，范围内每个已登记 D# 的派生可见（或：task-state 显式 audit_report 覆盖字段，生成器读取）——方案二选一，spec 必答 | P1-3 机制侧（CT-58） | 主体 |

## spec 必答题（写代码前回答）

1. **stale 判定的模块归属映射从哪来**？验收点 yaml evidence 无模块字段——用 yaml `modules:` 行（线级）够不够粒度？验收点级映射缺失时 fail-open 还是 fail-closed？（铁律 47 契约：输入=yaml 验收点+git log，输出=stale 标记+依据 commit，降级=映射缺失时显式 degraded 标注不静默跳过）
2. **stale 后的 UX**：verified → verified+stale 标注（进度页降色）还是直接回落 uncommitted？对 K3 复核流程的影响？
3. **B 项方案取舍**：范围解析（脆弱，文件名约定）vs task-state 显式字段（迁移成本，N 个历史批次报告）？给出选择依据 + 迁移清单
4. **真实用例对账**：线1 验收点 1-2/1-4/1-6（证据 2026-08-29 前）× D556 69d81c58（2026-08-29 后 renderer 变更）——机制上线后这三点必须被标 stale；1-1/1-3/1-5/1-7（Mac 半边，无后续变更）不误伤。用这对真实用例做验收测试

## 验收（物理可复现）

1. 新判定函数契约 JSDoc（铁律 47）+ 测试三路径（正常/stale 命中/映射缺失降级）有 expect 断言（铁律 48）
2. 真实用例对账：对 origin/main 真数据跑 calc-progress，输出 diff 显示 1-2/1-4/1-6 stale 标注、Mac 半边四点不受影响（输出留 evidence）
3. 回归：D576 的 redeem-task-redeem.test.sh 5/5 + alloc 13/13 仍绿；calc 重跑主数不意外漂移（除 stale 标注行）
4. 治理脚本变更 → commit 引用 memory/notes 四态 Note（铁律 49）+ VERSION.md bump（CT-42）

## 写集约束

- 可碰: scripts/product-lines/calc-progress.py（+redeem-progress.py 仅当 spec 必答 1 判定需要）、tests/control-tower/ 新增测试、task-state/D579.json、.claude/task-briefs/2026-09-05-D579-*、VERSION.md、memory/notes/
- **不碰**: scripts/audit/、product-lines.yaml、src/、electron-renderer/、pre-commit 门禁脚本

## 交付要求

1. spec 命名: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D579-k3-verdict-stale-20260905.md（spec-only 提交先行，D556 先例）
2. evidence: calc 前后 diff 输出 + 测试输出全部 git 跟踪路径落盘（根级 evidence/ 被 .gitignore 禁用）
3. 交付声明 DS 与 dev doc 一一对应（S-10），缺项显式 descope
