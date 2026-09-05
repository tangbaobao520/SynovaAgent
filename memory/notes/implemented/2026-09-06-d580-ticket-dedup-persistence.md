---
状态: implemented
日期: 2026-09-06
决策: D580 工单切片三项裁决——① finding.id 稳定键 = 去时间戳后缀（不加维度哈希）; ② 通知去重持久化载体 = 独立 SQLite 表 sentinel_notification_dedup（B-19 裁决）; ③ 工单读路径写读同源（表为准, 内存只兜底 + degraded 标注）
理由: 键=问题类身份, 值漂移由 INSERT OR REPLACE 内容刷新承载（43 文件互斥分支实测）; B-19 按复活需求选型——dedup 需复活 → 持久化, 介质选最简 KV 表（journal 重放是复杂状态机的方案, 单事实 KV 用日志 = 两处状态源, 违背 K3 P2-3 单一权威原则的姊妹原则）; 表空降级比静默空列表诚实（铁律 24）。
---

# D580 — 告警工单去重持久化 + 键稳定化裁决

## 决策上下文

- **根因链**: N14（finding.id 含时间戳 → 去重窗口永不生效, D354 只修了 signal/notif/conflict 三键, aggregate finding 键未修）+ K3 P2-3（getSentinelTickets 读内存不读表, 写读分裂）+ 通知去重 = 内存 Map 10min 硬编码（重启即丢, 且违背 D339 裁决 A 的 5min）。
- **裁决 1（finding.id）**: 去时间戳后缀即稳定键。既有类别前缀（e4-concent-crit 等）已编码哨兵维度+类别+严重度; 维度哈希不引入——实测 43 文件同类别每轮至多 1 条（if/else 互斥）, 维度身份变化由工单 diagnosis 内容刷新承载（工单=问题类, 非问题快照）。
- **裁决 2（去重载体）**: 独立表 sentinel_notification_dedup(key TEXT PRIMARY KEY, last_sent_ms INTEGER NOT NULL)。对照: 加列拒绝（键基数不对齐+关注点混杂）; journal 拒绝（单事实 KV 不需 full-log replay; 第二持久化介质 = 两处状态源）。TTL: 启动时 DELETE 过期行（惰性无害, 不建定时任务）。窗口 5min（D339 裁决 A 落地）, env SENTINEL_NOTIFICATION_DEDUP_MS 可配。
- **裁决 3（读路径）**: 表为准, 内存只兜底; 降级以 source + degraded 双标记结构化暴露。
- **参考系**: 参考：Anthropic（单一事实源/fail-closed）+ DSH B-19 持久化分级哲学（docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md §4）+ 第一性原理（最少机制）+ 结论（三裁决收敛无分歧）。

## 遗留缺口（如实记录, 供后续任务认领）

1. closeTicket 的 signal_id LIKE '%sentinelId%' 匹配不到 auto 工单（signal_id = sig_${entity} 不含 sentinelId 字面）——D580 裁决不修（超派单范围）。
2. signal-aggregator extractEntityKey 取 title 前缀含活值 → 值漂移场景 sig id 漂移 → auto 工单 id 漂移（同输入双跑不受影响）。修复需动 extractEntityKey 值剥离。

## 相关 D#

- D580（本任务）
- D354（signal/notif/conflict 三键稳定——本裁决补 finding 键）
- D339（创始人裁决 A: 去重窗口 5min——本裁决执行）
- D463/D466（自动工单 INSERT OR REPLACE 幂等——键稳定的前提)
- K3 P2-3（写读同源教训）
