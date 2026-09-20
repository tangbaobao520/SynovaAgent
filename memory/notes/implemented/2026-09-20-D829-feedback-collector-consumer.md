---
状态: implemented
日期: 2026-09-20
决策: D829 把 GA 纠错接进 @synova/evolution 收集器（生产侧持久化 + 唯一只读出口），并修掉 collectFeedback 的 id 唯一性缺陷（同毫秒写入静默互相覆盖）
理由: |
  线 17-1 的真实缺口不是「没人调用 collectFeedback」——src/routes/chat.ts:70-71 早在生产路径调用它，
  但（a）未传 memoryStore → persisted=false，只落模块级内存 Map；（b）.catch(() => {}) 空吞（铁律 24 违规）。
  更关键的是读取/消费侧零生产读者：getFeedbackByOrg / getFeedbackByAction 在 src/ 零调用，
  而下游 OrgAdapter(org-adapter.ts:199-204,275-280) 读「enterprise_fact + tags[user_correction]」——
  src/ 无任何生产者写该形状 → 消费者恒空转。
  故本卡在 GA 纠错回流活单源 src/routes/ga-calibration.ts 上补两段：
    ① 生产：POST /api/ga/calibration 的 mark_error/rewrite_logic/demote_signal 成功路径
       调 collectGaCalibrationFeedback(input, 真 AgentMemoryStore) → persisted=true
    ② 读取：GET /api/ga/calibration/evolution-feedback（org 隔离 fail-closed）
  同时把 GA→evolution 的 decision 映射（mark_error→reject / rewrite_logic→modify /
  demote_signal→reject；add_context 不收集）放在 packages/evolution（L0 语义留 L0），L1 只薄调用。
  附带缺陷修复：collectFeedback 的 id 原为 `fb_${Date.now().toString(36)}`，同毫秒连续写入 id 相同，
  而持久化 key=`correction_${id}` 且 AgentMemoryStore 按 (orgId,key) UPSERT → 同毫秒第 2..N 条纠错
  被静默覆盖（实测 5 连写 distinct=1）。→ 追加随机后缀（同 rule-version-manager 的 snap_ 命名法）。
  该缺陷此前被一条存量测试「意外掩盖」：getFeedbackByAction 用例依赖覆盖后的单条记录才能通过。
---

## 触发场景

产品线 17-1（进化闭环）验收点：`feedback-collector 被真实调用，老板说「你判错了」能被消费`，原 `status: failed`。
判据 = 生产调用点 file:line + 真实反馈进收集器且可查 + 下游可消费。

## 相关 D#

- 任务卡：`task-state/D829.json`
- 规格：`.claude/task-briefs/2026-09-20-D829-feedback-collector-evolution-wiring.md`（队长 2026-09-20 全批）
- 上游：`docs/synova/coordination/批十三-断线补卡与固化-20260918.md` §一 D829
- 前置修正：`docs/synova/coordination/批十四-开工前冲突扫描-20260920.md` §四（本卡再修正两处：chat.ts 已有调用点 + 读取侧零读者）

## 未覆盖（登记遗留，非本卡写集）

1. `src/routes/chat.ts:70-76` —— 既有 `collectFeedback` 调用不传 memoryStore + `.catch(() => {})` 静默吞错（真缺陷，另开卡）
2. `src/routes/evolution.ts:210` —— `collectAllFeedback()` 零参调用恒返回 `events: []`（假 200）；且 `packages/evolution/src/feedback-collector.ts` 该函数用 `orgId: ''` 查询，本就永远读不到真实 org
3. 本卡只覆盖 GA 纠错一路；`user_behavior` / `external_data` / `diagnosis_contradiction` 三路仍无生产入口（线 17-2 / 17-4 范围）

## 边界（不得越界声称）

本卡**不**宣称「越用越准」/「进化能力」——只交付物理事实：哪个端点、哪条命令、什么结果。
「下次诊断变准」需线 17-4（校准周期 T-3 真实闭环）另行验证。
