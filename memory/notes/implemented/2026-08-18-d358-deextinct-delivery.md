---
status: implemented
date: 2026-08-18
task: D358
tags: [merged-sentinel, de-extinct, erp-standard, snake_case, bridge-removal]
---

# D358 — 合并哨兵去 _extinct 桥接 + props 契约对齐 erp-standard

交付：`38dda82f`（worktree synova-wt-d358，branch feat/win-d358-merged-sentinel-deextinct），PR #58。

## 决策（dev doc §3.2 决策 1-10，K3 可核）

1. **契约冲突**：dev doc §1 与 D355 实际文件不符 → 以 erp-standard.json 为准。交付中途上游 D455 落地（契约全 snake：`cash` + `operating_expense`），merge origin/main（30 commits）后按新契约重对齐。
2. **归一化上移**：compute 公式零改动（verbatim 迁移），数据获取集中到 aggregate 归一化层。
3. **阈值来源**：11 个 manifest key 走 `this.manifest.thresholds`；5 个无 key 沿用 T7b 硬编码先例。
4. **CCC 死代码接线**：旧 aggregate import `computeCashConversionCycle` 从不调用（铁律 37），新 aggregate 接线。
5. **分母 0 → 降级**：堵 asset-turnover/debt-equity/interest-coverage 等 0/0 假 critical，删除 fallback 0/99/rev-1。
6. **假 critical 修复**：margin-vs-benchmark degraded → `gap: 0`；profit_margin 加 `!degraded` 门控。
7. **接线链**：src/sentinel/types.ts import-type 链指向新 computes（组 4a 物理证据）；exportKey/check 签名不变（sentinel-merge-d15a 锁定）。
8. **P1-3 双层降级**：入口 REQUIRED_FIELD_GROUPS 缺失 → degraded finding；扩展字段缺失 → log.warn + 该 metric 不参与本次计算。
9. **CCC 取整语义**：原算法 `Math.round(dio+dso−dpo)` verbatim 保留；测试期望修正为 43/243（compute 不动，测试修正）。
10. **中途契约迁移（D455）**：内部 typed record 字段名保持 `operatingExpenses`——契约边界 = aggregate 归一化层，compute 纯函数接收归一化后数据（算法冻结承诺）。

## 同步记忆表

| 教训 | 沉淀位置 |
|------|---------|
| brief 文件名日期 = 认领判定（D366）——跨午夜提交须改名今日前缀 + 同步 current-brief | Claude 会话记忆（d358-delivery-session） |
| dev doc 写集表必须逐文件枚举（G12c 反向对账不吃 glob，`*.ts` 被当字面路径） | Claude 会话记忆 |
| hook-block-write 12 项检查：项目身份须含字面「增长导航」；敷衍词检测在去空白后匹配（`不适用`+`跳过该metric` 会跨段误中） | Claude 会话记忆 |
| /tmp/.synova-before-brief 证据：全部为本人条目时 rm 整体安全（D356 先例）；hook 通过后再清 | 已按 D356 记录 |
| 二次平基：push 前 D335 再拦 3 commits（D456）→ 同 backup+checkout+FF-merge+restore 流程 | 沿用 D363/D333 N13 记忆 |

## 教训（本任务新增）

- 提交门禁三连败：① D366 文件名日期（08-18 brief 跨午夜失效）② G12c 写集 glob 漂移（声明 5 → 实际 42 条须全枚举）③ hook 质量检查 + 证据文件（增长导航缺失 + 敷衍词误中 + 5 条 stale 证据）。
- synova-commit 内置 push 先于 COMMITTED 记录落盘 → 首推必被 D331 对账拦（D356 先例第三次命中）——手动重推即过。
- 主树 bypass.log 补记 COMMITTED（D356 先例）：主树后续推送对账需要本 hash 记录。

## CI

push + PR 双 CI **绿**（PR #58，2026-08-19T14:18Z/14:17Z 两 job success）。DS1-DS6 交付前已验证；DS7 门禁全过无绕过；DS8 = CI 绿确认。
