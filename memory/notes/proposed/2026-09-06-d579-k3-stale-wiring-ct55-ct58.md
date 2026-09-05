---
状态: proposed
日期: 2026-09-06
决策: D579 双机制接线——①k3 verdict 纳入证据新鲜度门（freshness_gate: TTL 14 天 + git_touched_after 线级 modules，与 machine 类同语义，rejected 短路保持在前，降级三场景显式 pending_k3 + problems）；②批次审计报告派生改为 task-state audit.report 显式字段优先（过 D412 _committed 口径）+ 文件名 glob 兜底（同样过 _committed）
理由: K3 D572 审计 P1-1/G2——calc 两个 k3→verified 出口（原 L149/L156）在失效检查之前直接 return，真 K3 审计 pass 永久免疫时效检测（D556 在证据日期后改 renderer 452+193 行而 1-2/1-4/1-6 不失效）；P1-3 机制侧——gen-cto-health 按文件名首个 D# 派生 + 结尾 glob，批次报告（D517-D519 型）中间 D# 全部隐形，CONDITIONAL verdict 滞留无人看见。四步决策框架（spec §5.3）：映射=线级 modules（D572 G2 建议原文，点级映射无数据源且 yaml 禁改）；stale 落既有第六态（不加第七态，计分口径单一）；B 项选 task-state 显式字段（123/126 已有字段零迁移，redeem L108-113 已当权威；文件名四种形态含降序对 D551-D487 证明范围解析必碎）；降级落点 pending_k3（"查不了"≠"过时/没变"，不假绿不假黄，自愈）。
---

## 变更清单
1. scripts/product-lines/calc-progress.py：新增契约函数 freshness_gate（TTL 复用 EVIDENCE_TTL_DAYS，git 检测复用 git_touched_after；日期非法/git 失败/映射缺失 → problems 显式登记 + unknown）；k3_only 与通用两个 k3→verified 出口接线（latest pass governs 新鲜度，rejected 短路在先）
2. scripts/control-tower/gen-cto-health.py：新增纯函数 resolve_audit_report（state 字段优先 → 文件名兜底 → (None,None)；未提交/越根不采信）；analyze_task_state 审计解析接线替换（verdict 优先序不变，phantom 语义保持）
3. tests/control-tower/calc-k3-stale.test.py（A1-A8，13 用例）+ gen-cto-health-batch-report.test.py（B1-B5）新增；product-lines.test.py 两处 enshrined 夹具相对日期化（test_six_states / test_hundred_percent_gate）
4. VERSION.md V4.9.0 → V4.9.1（CT-42）
5. evidence: docs/synova/audit-reports/D579-k3-verdict-stale-evidence-20260906/（calc-diff.md 真数据 11 点对账 + test-output.md red/green 两轮）

## 执行证据
- verify: calc-k3-stale.test.py 13/13 绿（red 8 fail + A9 中间红已留证 test-output.md）
- verify: gen-cto-health-batch-report.test.py 5/5 绿（red: 4 error + 1 fail）
- verify: product-lines.test.py 25/28（3 既有失败精确保持）；redeem-task-redeem 5/5；alloc-task-id 13/13；gen-cto-health.test.sh 7/7
- verify: 真数据对账 11 点 verified→stale 零逆向（spec 8 点全命中 + 7-2/8-1/10-3 为 closeout K3 记录先于 D577 提交 ece4e268 的机制正确失效）；19-2/22-1 保持 verified（线 modules 09-02 后零提交实测）；线 1 逐点零变化
- verify: gen-cto-health 实跑 D517/518/519 audit 列 "—"→CONDITIONAL_PASS，status impl_done→audited
- 参考系: Anthropic 工程基线（缓存/证书类结论必须带 TTL 与失效条件，fail-closed）+ 第一性原理（verified 的半衰期 = 绑定模块的变更频率；被审计 = 仪表盘可见）+ 仓内实证（D572 G2 修复建议原文 + redeem audit.report 权威先例）

## 效果与边界
- 效果: 真实数据 8%→1%（11 点水分挤出——与 D576 CT-53 的 11%→6% 同性质，诚实回落为预期行为）；批次报告中间 D# 仪表盘可见；翻绿路径不变（新 K3 复核/新机器证据日期新鲜 + modules 无变更 → 自动回 verified）
- 边界: 不改 product-lines.yaml（线集维护权归创始人）；线级 k3_gate（line: 复核）不接入失效门（真数据零 line: 记录，spec §6 已知局限）；founder_demo 分支不接入（时效语义需创始人裁决）；CT-58 数据侧（D517-519 verdict 更新）禁手工，由派生自动可见
- 同批发现（另立任务）: gen-cto-health _head_tracked_files 未处理 core.quotepath 八进制转义 → 中文路径工件假 phantom（D445 实证；repro 测试 5/2 既有失败同根因）
