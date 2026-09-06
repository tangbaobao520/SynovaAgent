---
状态: implemented
日期: 2026-09-06
决策: CT-62 freshness_gate 证据时间戳粒度——git_touched_after 支持 ISO datetime（evidence "at" 字段），同日验证不再被当日提交误杀
理由: D579 机制的同日边界缺陷（7-2/8-1/10-3 closeout 同日失效首证；K3 合并批后 8-2/8-3/8-4 兑换与整个 stale 重验批被同一问题阻塞）——evidence date 是天粒度，T00:00 起算把当日提交全算 touched，"今天验证今天的代码"恒判 stale。
---

## 变更清单
1. scripts/product-lines/calc-progress.py：git_touched_after 接受全量 ISO（"T" in since_date 判别）；freshness_gate 加 evidence_at 参数；两个 k3 出口 + main verdict dict 透传 rec.get("at")；latest 选择键 (date, at) 二元组
2. tests/control-tower/calc-k3-stale.test.py：+2 CT-62 用例（datetime 边界 fake git：at 07:00 早于 07:30 提交 → stale 不放松；at 08:00 晚于 → fresh 修复）

## 语义矩阵
- at 缺省（存量记录）→ 旧语义 T00:00（保守不变）
- at 提供且晚于当日提交 → fresh（本修复的价值）
- at 提供且早于当日提交 → stale（粒度增强不放松）

## 效果
- 8-2/8-3/8-4 兑换记录（at=now）可即时 verified；D585 stale 重验批的机器类证据同受益
- 参考系: 第一性原理（证据时间戳应精确到验证时刻）+ D579 契约兼容（at 缺省零破坏）
