# task-state — 任务级状态机（D382 设计，2026-08-16）

> **一句话**：每个任务一个 `task-state/<task-id>.json`，是「dev-doc spec + 代码 + 审计报告」三产物的唯一串联点。
> 回答：这个任务到哪一步了？spec 交了吗？代码实现了吗？K3 审了吗？结论是什么？

## 状态机

```
claimed ──dev-doc 交付 spec──▶ spec_done ──编码交付实现──▶ impl_done ──待审──▶ audit_pending
   ▲                                                                              │
   └────────────────────────────── K3 出 verdict ◀───────────────────────────────┘
                                   ├─ PASS → audited（终态）
                                   └─ FAIL → fix_needed ──▶ 另起 FIX 任务（新 D#，自己的 state）
```

**审计闭环铁律（2026-08-16 创始人裁决）**：
> **K3 审计出问题 → 一律另起修复任务（FIX D#），禁止直接改原任务。** 否则证据链混淆——
> 原任务已交付+标记完成，写集已 close；塞回修复 = 污染原交付证据（D328 声明-内容一致性门禁会拦），
> 且 K3 无法区分「原问题」和「修复质量」。折入例外需 CTO 判定（同领域+进行中任务+改动小）并标注。

## D393 升级（2026-08-16）：状态从工件自动派生

> **status/spec/impl/audit 由生成器从工件重算，不再人工维护**（防失真——GitHub/Linear 同哲学）。
> json 里的 status/impl/audit 字段为 **deprecated**（生成器派生覆盖）；**spec 保留 json 兜底**（spec.path 文件真实存在时计 spec，见下）——D400 定稿语义。
> 人工只需维护：task_id / title / fix_task_id（生成器读不到的元数据）。

| 状态 | 派生自 | 判定 |
|------|--------|------|
| spec ✅ | docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D#-*.md | 文件存在 |
| impl ✅ | git log 含该 D# 的提交 | (D#) 精确匹配 |
| audit | docs/synova/audit-reports/*D#*.md | 存在 + verdict 解析 |
| status | 三态组合 | audit→audited / impl→impl_done / spec→spec_done / 无→claimed |

## 字段契约

| 字段 | 类型 | 说明 |
|------|------|------|
| task_id | string | 任务编号（DXXX 或 SYNOVA-IMPL-DSH-*） |
| title | string | 任务名 |
| status | enum | claimed / spec_done / impl_done / audit_pending / audited / fix_needed |
| spec | object\|null | { path, commit, by, at } — dev-doc 交付 |
| impl | object\|null | { commit, by, at, files[] } — 编码交付 |
| audit | object\|null | { report, verdict, by, at } — K3 审计（verdict: PASS/FAIL/CONDITIONAL_PASS） |
| fix_task_id | string\|null | audit=FAIL 时指向另起的 FIX 任务 |
| updated_at / updated_by | string | 最后更新 |

## 谁写什么（各填各的段，不撞车）

| 角色 | 何时写 | 写哪段 |
|------|--------|--------|
| CTO | 任务派发时 | 建 state 空壳（claimed） |
| dev-doc | spec 推送后 | spec 段 + status→spec_done |
| 编码 | 实现提交后 | impl 段 + status→impl_done |
| K3/审计 | 报告落库后 | audit 段 + verdict；FAIL → fix_needed + 填 fix_task_id |
| 生成器 | 读 | 第③面 CTO-HEALTH 任务汇总段（gen-cto-health.py） |

## 落位状态（防 M3 建了不接线）

- [x] 模板 + 状态机定义（本目录）
- [x] D356 / D379 示范 state（2026-08-16）
- [x] gen-cto-health.py 读 task-state 显示任务汇总（第③面）
- [x] dev-doc / 编码 persona 各加「完成后更新 task-state」规则
- [x] cto-handover 技能固化审计闭环铁律
- [ ] 阶段 2：K3 报告 JSON 化（D347/D349）→ audit 段自动填充
- [ ] 阶段 3：门禁强制校验 state 字段（防自觉失效）
