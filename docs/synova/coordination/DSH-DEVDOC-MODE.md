# DSH Dev-Doc 模式规格（Mac DSH 自建预设）

> 2026-08-16 创始人定（决策记录：第一性原理——谁离代码最近谁写 doc，消除跨机知识搬运；Anthropic——maker-checker 分离换层到 PR 审查 + K3 审计 + gatekeeper 机器门禁；DeepSeek——一个预设 vs 永久协调税，两参考系收敛 → 采纳）
> 执行者：Mac DSH（自建预设）；D# 由 Codex 统一分配；上线后进 K3 审计（无豁免）。

---

## 一、模式定义

**名称**：`synova-dev-doc`（DSH 预设，供 Mac DSH 在自己的所有权模块上写 dev doc）
**触发**：DSH 线任务开工前（对照 TASK-ROUTING.md 模块所有权表确认归属后）

## 二、预设组成（最少机制，5 件）

| # | 组件 | 内容 |
|---|------|------|
| 1 | **Persona** | Harness 架构师 + dev doc 作者：理解五层架构/铁律/写集契约；红线自觉（不写审计标准、不碰 K3 判定） |
| 2 | **模板注入** | task-start 模板全文（Q0 定位/文件审计 + Q1 调研含 memory/ + Q1c 决策参考系 + Q2 范围含写集文件路径 + Q3 验收三环节 + 架构层 + Done 可证伪）+ DS 清单 + **完成标准三件套**（代码提交+门禁绿+关联场景 exit 0+证据入驾驶舱） |
| 3 | **工具** | 读权威文档/设计文档/K3 标准；grep 接口真实性反向验证；dev-doc-gatekeeper 结构校验 |
| 4 | **约束** | ① D# 由 Codex 分配（不自行编号）② 写集声明（verify-parallel 查重叠）③ 红线：不编写审计标准，判定一律引用 K3-AUDIT-STANDARD-v1-20260815.md ④ 完成后 PR → Codex 预审 |
| 5 | **输出** | `docs/plans/codex/implementation/SYNOVA-IMPL-DXXX-*.md`（与 Codex 出的一致模板，不搞第二套标准） |

## 三、与 Codex 出 doc 的差异（只两处）

| 项 | Codex 出 doc | DSH 自出 doc |
|----|-------------|-------------|
| 适用任务 | Claude 线（src//extensions//packages/ 等） | DSH 线（product-lines/golden-scenarios/.github/src/mcp/electron/control-tower） |
| 预审 | doc 自审计（pre-dispatch checklist） | **Codex 预审**（PR 阶段：写集/范围/门禁） |

其余相同：同一模板、同一 gatekeeper、同一 DS 对账（S-10）、K3 审计无豁免。

## 四、落地步骤（Mac DSH 执行，半小时）

1. 用 DSH 的预设能力创建 `synova-dev-doc` 预设（挂 §二 5 组件；模板复用 `scripts/workflow/task-start.sh` 生成器）
2. 安装路径对齐 D370 的 DSH preset 体系（.dsh/skills + install-dsh-preset.sh 漂移检查）
3. 用第一个真实任务验证：GS-02/03/04 场景的 dev doc（先向 Codex 要 D#）→ gatekeeper 过 → PR → Codex 预审
4. K3 首审时把本模式本身列入审计对象（红线 3：无豁免）

## 五、护栏总览（防"自我闭环"的完整链条）

```
DSH 自出 doc（gatekeeper 机器门禁结构）
   → D# 由 Codex 分配（唯一登记口）
   → 实现（写集契约 + verify-parallel 查重叠）
   → PR → Codex 预审（写集/范围/门禁）
   → 创始人 Merge
   → K3 审计（交付端全量核，无豁免）
```

*maker-checker 分离没有取消，只是从"doc 层"移到了"PR 审查层 + K3 审计层"，结构质量由机器门禁兜底。*
