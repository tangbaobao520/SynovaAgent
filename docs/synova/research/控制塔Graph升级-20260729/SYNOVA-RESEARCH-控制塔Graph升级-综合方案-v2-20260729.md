<!--
  SYNOVA-RESEARCH-控制塔Graph升级-综合方案-v2-20260729
  状态: 研究定稿 (v2: 补全7个缺口)
  依赖: 控制塔系统Ch1-7, Appendix A, 131脚本审计, 11信号, 权威14 MVS
  目标: 从"组件健康检查"升级为"项目工作流可视化"——Graph建模开发流程，项目管理视图
  v2变更: 审计器统一入口, 契约门禁接入网守, 断边检测, 脚本归并, 视图平移, MVS数据源, 缺口承认
-->

# 控制塔 Graph 升级 v2：从组件健康到项目全貌

> 2026-07-29 | 131 脚本审计 + 7 缺口修复 + Graph 架构重构

---

## 一、基础设施审计

### 1.1 审计范围

| 类别 | 数量 | 方法 |
|------|:---:|------|
| scripts/ 全部文件 | 131 | 逐文件交叉引用 AGENTS.md + hooks.json |
| .codex/ 基础设施 | 20+ 文件 | 信号存在性 + 内容有效性验证 |
| Git hooks | 4 (pre-commit, commit-msg, post-commit, pre-push) | 内容 vs AGENTS.md 声称 |
| Codex hooks | 4 (3 PreToolUse + 1 PostToolUse) | hooks.json vs 脚本存在性 |
| 信号文件 | 11 | JSON 有效性 + component/status 字段 |

### 1.2 守护基础

| 组件 | 脚本 | 状态 | 证据 |
|------|------|:---:|------|
| 校验网守 | synova-commit (12.5KB) | ✅ 活跃 | 调用 pre-commit-check.sh |
| 预提交 8 组检查 | pre-commit-check.sh (39.2KB) | ✅ 活跃 | as any/empty catch/secrets/tests/wiring/compute/bypass |
| 信号发射器 | emit-signal.py (2.6KB) | ✅ 活跃 | 8 组件调用 |
| 环境验证 | env_validator.py (12.1KB) | ✅ 活跃 | env-snapshot.json + env-validator.json |
| 契约存档 | contract-archiver.py (13.3KB) | ⚠️ 部分 | 提取契约但网守未调用门禁 |
| 外部审计器 | external-auditor.sh (9.3KB) | ⚠️ 部分 | Ch5 定义5子模块, 仅实现2 (runner+signal) |
| 写入锁 | write_lock.py (8.2KB) | ✅ 活跃 | write-lock.json 已产出 |
| 上下文注射 | context-injector.sh (2.5KB) | ✅ 活跃 | context-injector.json 现已产出 |
| 门禁检查 | check-gates-v2.py (82.7KB) | ✅ 活跃 | gate-status.json |
| 仪表盘 | generate-dashboard.py (27KB) | ✅ 活跃 | /cockpit 路由 |

**关键缺口 (审计器 + 契约):**
- 审计器: Ch5 定义 5 子模块 (runner/rules/cross-check/signal/report), 实际实现 2/5。rules(已知错误模式)、cross-check(与Agent自评交叉验证)、report(结构化审计报告) 未实现
- 契约存档器: contract-archiver.py 提取并存储契约, 但 pre-commit-check.sh 从未调用契约门禁——"Agent 产出是否匹配上游契约"的检查不存在。提取了、存档了、没人用它阻断不合规的提交

### 1.3 活跃浪费

| 问题 | 示例 | 影响 |
|------|------|------|
| 版本残留 | verify-v440.sh, verify-v444.sh (与 verify-incremental.sh 功能重叠) | 混淆——不知道当前版本 |
| 临时构建脚本 | scripts/tmp/ (9个文件) | 不确定是否仍在使用 |
| 重复检查 | wire-check.sh ×3 (scripts/ + checks/ + workflow/) | 冗余维护 |
| 死引用 | hook-check-memory.sh 引用 .claude/bypass.log (已清空归档) | 可能执行异常 |
| 重复 hook | hook-block-no-q0.sh vs hook-block-write.sh | 功能重叠 |

### 1.4 信号文件：现在 vs 当初

| 信号 | 7月24日 | 7月29日 |
|------|:---:|:---:|
| external-auditor.json | ✅ | ✅ |
| gate-status.json | ✅ | ✅ (10.6KB, 实时数据) |
| contract-archiver.json | — | ✅ |
| env-validator.json | — | ✅ |
| gatekeeper.json | — | ✅ (实时预提交数据, 非硬编码) |
| context-injector.json | — | ✅ |
| write-lock.json | — | ✅ |
| loop-scheduler.json | — | ✅ |
| d255-electron-packaging.json | — | ✅ |
| ga-dashboard.json | — | ✅ |

从 2 个 → 11 个。Windows 文件锁修复解锁了大部分。

---

## 二、当前控制塔的根本局限

### 2.1 它回答的问题

| 仪表盘显示 | 答案 |
|----------|------|
| 6 组件信号卡片 | "工具有没有在工作？" |
| 17 门禁 | "产品离完整还有多远？" |
| R/D/C 流水线 | "91 个任务分布在哪三阶段" |
| 阻断清单 | "哪些组件信号异常" |

### 2.2 它回答不了

| 你想知道 | 仪表盘无法回答 |
|---------|-------------|
| 整体进度 | "离客户部署还有多远？10 个 PARTIAL 门禁意味着什么？" |
| 当前在做什么 | "91 个任务中今天推进几个？卡住在哪？" |
| 关键路径 | "哪条链路阻塞会直接推迟客户部署？" |
| 瓶颈位置 | "问题出在哪个 Agent？Research 产出慢还是 Claude Code 接线断？" |
| 链路质量 | "这条边看起来是实线——但底下是空壳吗？" |
| 趋势 | "这周和上周比改善还是恶化？" |

---

## 三、缺口修复 (Graph 升级前置条件)

### 3.1 审计器统一入口

**问题:** Ch5 定义 5 子模块——runner/rules/cross-check/signal/report。实际代码仅 runner+signal 实现。check-lessons-learned.sh 等脚本散落各处，没有统一调度。

**修复:** external-auditor.sh 增加 `--dispatch` 模式——通过 known-error-patterns.json 驱动检查规则，统一入口调用所有子检查脚本。审计报告统一输出到 `.codex/audit/audit-result.json`（单文件而非分散输出）。触发时机：post-commit hook 自动触发 + 定时（每日）+ 手动。

### 3.2 契约门禁接入网守

**问题:** contract-archiver.py 提取并存储契约——但 pre-commit 从未调用契约门禁。"Agent 产出是否匹配上游契约"的检查不存在。

**修复:** pre-commit-check.sh 新增第 9 组——契约门禁。检查 task brief 中声明的产出文件是否与实际 staged 文件一致、产出文件的 Edge ID/函数签名是否与契约声明匹配。不匹配时阻断提交。contract-archiver.py 的输出（contract.json）作为检查输入。

### 3.3 断边检测规则

**问题:** Graph 视图显示 token 流转，但"空壳"连接——代码存在、文件存在、但功能断裂——会被错误显示为实线。

**修复:** Graph Builder 增加 HealthState 多维判定——每条边不是简单的"连通/断开"，而是四个维度的综合得分：

| 维度 | 检测规则 | 权重 |
|------|---------|:---:|
| 存在性 | 文件/函数/端点是否真实存在？ | 25% |
| 接线 | 调用方在代码中存在且参数有效？ | 25% |
| 非空壳 | 构造函数非空数组、函数体 > 20 字符、非 `throw new Error('Not implemented')` | 25% |
| 信号 | 对应的信号文件存在且 status != unknown？ | 25% |

综合得分 < 50% → 虚线 (功能断裂)。50%-75% → 点线 (已接线但未完全验证)。> 75% → 实线 (健康)。

**空壳识别模式:**
- `new X([])` — 构造函数传空数组
- `import type { X }` — 仅类型导入，未实例化
- `return {}` 或 `throw new Error('Not implemented')` — 函数体为存根
- 调用方存在但传入参数为 null/undefined/空数组 → 递归判定上游

### 3.4 清理后脚本归并

**目标架构:** 清理后每个活跃脚本归属到对应的控制塔组件：

| 组件 | 脚本 | 作用 |
|------|------|------|
| **注射器** | context-injector.sh, inject-context.py, inject-commit-instruction.sh | 任务启动前注入权威文档 |
| **网守** | synova-commit, pre-commit-check.sh, commit-msg-check.sh | 提交门禁 |
| **契约** | contract-archiver.py, contract-schema.json, run-contract-gate.ts | 契约提取+门禁 |
| **写入锁** | write_lock.py, lock-scanner.sh, lock-cleanup.cron | 文件锁管理 |
| **审计器** | external-auditor.sh, known-error-patterns.json, audit-rules.json, check-lessons-learned.sh, check-tech-debt.sh, check-integrity-startup.sh, check-security.sh, checker-review.sh | 统一审计入口 |
| **环境** | env_validator.py, validate-env.sh, validate-expert-config.sh | 环境验证 |
| **仪表盘** | generate-dashboard.py, emit-signal.py, check-gates-v2.py | 信号+门禁+视图 |
| **CI/CD** | check-acceptance-ci.sh, check-file-driven.sh, check-architecture.sh | 架构完整性 |

**删除/归档清单 (29个文件):**
- scripts/tmp/ — 全部 9 个 (临时构建脚本)
- _fix_parser.py, test_write.py, temp_build_report.py — 一次性调试
- verify-v440.sh, verify-v444.sh — 旧版本 (verify-incremental.sh 已替代)
- wire-check.sh, checks/check-wire-full.sh — 合并到 workflow/wire-check.sh
- hook-block-no-q0.sh — 与 hook-block-write.sh 合并
- gen-survey.py, translate-research.py — 一次性研究工具
- __pycache__ 目录 — 构建缓存

---

## 四、Graph 升级：三个视图

### 4.1 数据流

```
Git log + Task briefs + Signal files + Contract files
          ↓
    Graph Builder (新: HealthState 判定)
          ↓
    ┌─────┼─────┐
    ↓     ↓     ↓
  Graph   PM   Flow
  View   View  View
```

三个视图消费同一份图数据。

### 4.2 视图一：工作流图

每个组件是一个节点，边表示 token 流转方向。节点颜色 = 实时信号状态(绿/黄/红/灰)。节点大小 = 当前队列长度 (在该节点的待处理 token 数)。边粗细 = 最近 24h 经过该边的 token 数。边样式 = HealthState 得分 (实线 > 75% / 点线 50-75% / 虚线 < 50%)。悬停节点显示延迟、待办数、最近事件摘要。

### 4.3 视图二：项目经理仪表盘

门禁按 MVS 阶段分组 (数据来源: 权威文档 14 §4.2 MVS 能力清单 + CT 附录 A §1.2 门禁依赖链):

| 阶段 | 门禁 | 当前状态 | 阻塞客户部署? |
|------|------|:---:|:---:|
| 必须完成 | Gate 1(企业注册), Gate 2(多人使用), Gate 3(数据管道), Gate 7(方向监测) | 1P/3P/0F | 是 |
| 并行推进 | Gate 8-11(Goal生命周期), Gate 15(知识积累) | 1P/4P/0F | 可推迟 |
| Phase 2 | Gate 0(启动自检), Gate 4(哨兵巡检), Gate 5(专家诊断), Gate 12(循环), Gate 13(静默) | 0P/5P/0F | 否 |
| 已通过 | Gate 6, Gate 14, Gate 16 | 3P | — |

每个阶段有进度条。关键路径 = "必须完成"阶段内的阻塞项 + 它们的依赖链。

### 4.4 视图三：Agent 链路健康

不是看 Agent 的成功/失败率——是看 Agent 之间的流转效率。每条 Agent→Agent 边显示: 产物一致性 (上游 output 是否被下游正确理解), 流转延迟 (上游完成后多久下游开始), 转化率 (上游产出中有多少被下游消费)。衰减最大的边被高亮。

---

## 五、旧视图到新视图的平移方案

| 旧视图元素 | 新视图位置 |
|----------|----------|
| 6 组件信号卡片 (状态+原因) | Graph 视图节点悬停信息 (状态+原因+延迟+待办) |
| 6 组件信号卡片 (计数/趋势) | Graph 视图节点详情面板 (点击节点展开) |
| 17 门禁面板 | PM 视图——MVS 阶段分组 (带进度条+依赖链) |
| R/D/C 流水线列表 | PM 视图——当前活跃任务 (按阶段过滤+阻塞标记) |
| 阻断清单 | Graph 视图——红色/黄色节点自动高亮 + 悬浮提示根因 |
| 网守 L1-L11 展开 | Graph 视图——网守节点详情面板 |

**不淘汰旧视图——旧视图的能力在新视图中有明确对应位置。** 用户打开仪表盘首先看到 PM 视图 (项目全景)，点击任意节点进入 Graph 视图 (工作流细节)，悬停节点获取原信号卡片的全部信息。

---

## 六、实施 Phase

### Phase 1: 补缺口 (前台——Graph 升级前置)
1. 审计器统一入口 + known-error-patterns.json 驱动
2. 契约门禁接入 pre-commit (新增第 9 组)
3. 脚本清理归并 (29 个删除 + 归属表)

### Phase 2: Graph 核心
4. Graph Builder (HealthState 4 维判定 + 断边检测)
5. 工作流图视图 (替代 6 组件卡片)
6. PM 仪表盘 (MVS 分组 + 关键路径)
7. Agent 链路健康视图

### Phase 3: 旧视图平移
8. 旧视图信息映射到新视图位置
9. 用户验收——PM 视图能否替代仪表盘日常使用？

---

## 七、缺口承认

与 v1 方案不同, v2 明确承认以下缺口并在 Phase 1 修复:

| 缺口 | v1 | v2 |
|------|:---:|:---:|
| 审计器 3/5 子模块缺失 | "保留不变" | Phase 1-1: 统一入口 |
| 契约门禁未接入网守 | "保留不变" | Phase 1-2: pre-commit 第 9 组 |
| 空壳连接检测 | 未定义 | Phase 2-4: HealthState 判定 |
| 清理后脚本归属 | 只列删除清单 | §3.4: 归属表 |
| 旧→新视图迁移 | "淘汰旧视图" | §五: 平移方案 |
| MVS 阶段数据源 | 未定义 | §4.3: 权威14+附录A |
| 对当前缺口的承认 | 无 | §一+§七 |
