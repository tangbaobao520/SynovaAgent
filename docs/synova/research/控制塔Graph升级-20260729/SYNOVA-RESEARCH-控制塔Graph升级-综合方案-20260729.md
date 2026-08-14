<!--
  SYNOVA-RESEARCH-控制塔Graph升级-综合方案-20260729
  状态: 研究草案
  依赖: 控制塔系统Ch1-7, Appendix A, 115+ scripts audit, 11 signals, 7 Git hooks, 4 Codex hooks
  目标: 从"组件健康检查"升级为"项目工作流可视化"——Graph建模开发流程，项目管理视图
-->

# 控制塔 Graph 升级：从组件健康到项目全貌

> 2026-07-29 | 完整基础设施审计 + Graph 架构重构
> 当前: 131 脚本, 约12-15个活跃, 大量冗余和死代码。仪表盘显示6组件健康——但看不到项目整体进展。
> 目标: 单一控制塔, Graph 建模开发工作流, 项目管理视图替代组件健康视图

---

## 一、基础设施审计：什么在真正工作

### 1.1 审计范围

| 类别 | 数量 | 审计方法 |
|------|:---:|------|
| scripts/ 全部文件 | 115+ | 逐文件列出, 交叉引用 AGENTS.md 和 hooks.json 确认活跃度 |
| .codex/ 基础设施 | 20+ 文件 | 信号文件存在性验证, 配置文件有效性 |
| Git hooks | 4 | .git/hooks/ 实际内容 vs AGENTS.md 声称 |
| Codex hooks | 4 | .codex/hooks.json 配置 vs 实际脚本存在性 |
| 信号文件 | 11 | .codex/signals/ 内容验证 |

### 1.2 守护基础

| 组件 | 脚本 | 状态 | 证据 |
|------|------|:---:|------|
| 校验网守 | synova-commit (12.5KB) | ✅ 活跃 | 调用 pre-commit-check.sh, 写入 bypass.log |
| 预提交 8 组检查 | pre-commit-check.sh (39.2KB) | ✅ 活跃 | as any/empty catch/secrets/tests/wiring/compute/bypass |
| 信号发射器 | emit-signal.py (2.6KB) | ✅ 活跃 | 8 个组件调用 |
| 环境验证 | env_validator.py (12.1KB) | ✅ 活跃 | env-snapshot.json + env-validator.json 已产出 |
| 外部审计器 | external-auditor.sh (9.3KB) | ✅ 活跃 | external-auditor.json 已产出 |
| 契约存档 | contract-archiver.py (13.3KB) | ✅ 活跃 | contract-archiver.json 已产出 |
| 写入锁 | write_lock.py (8.2KB) | ✅ 活跃 | write-lock.json 已产出 |
| 上下文注射 | context-injector.sh (2.5KB) | ✅ 活跃 | context-injector.json 现在已产出 |
| 门禁检查 | check-gates-v2.py (82.7KB) | ✅ 活跃 | gate-status.json 已产出 |
| 仪表盘 | generate-dashboard.py (27KB) | ✅ 活跃 | /cockpit 路由 |

### 1.3 活跃浪费和冗余

| 问题 | 示例 | 影响 |
|------|------|------|
| 版本残留 | verify-v440.sh, verify-v444.sh（和 verify-incremental.sh 功能重叠） | 混淆——不知道哪个是当前版本 |
| 临时构建脚本 | build_final.py, build_full.py, build_odc.py, build_odc_report.py, gen_s1/s2/s3.py | 不确定哪些还在使用 |
| 重复检查 | wire-check.sh, check-wire-full.sh, workflow/wire-check.sh（三个接线检查） | 冗余维护 |
| 死引用 | hook-check-memory.sh 引用 .claude/bypass.log（已归档） | 执行可能不正常 |
| 重复 hook | hook-block-no-q0.sh vs hook-block-write.sh | 二选一需清理 |

### 1.4 信号文件：现在产出 vs 当初

| 信号 | 7月24日 | 7月29日 |
|------|:---:|:---:|
| external-auditor.json | ✅ | ✅ |
| gate-status.json | ✅ | ✅ |
| contract-archiver.json | — | ✅ 新增 |
| env-validator.json | — | ✅ 新增 |
| gatekeeper.json | — | ✅ 新增 |
| context-injector.json | — | ✅ 新增 |
| write-lock.json | — | ✅ 新增 |
| loop-scheduler.json | — | ✅ 新增 |
| d255-electron-packaging.json | — | ✅ 新增 |
| ga-dashboard.json | — | ✅ 新增 |

**从 2 个信号增加到 11 个。** Windows 文件锁修复解锁了大部分信号产出。

---

## 二、当前控制塔的根本局限

### 2.1 它回答的问题

| 仪表盘显示了 | 对应的答案 |
|------------|----------|
| 6 组件信号卡片 | "工具有没有在正常工作？" |
| 17 门禁 | "产品离'完整'还有多远？" |
| R/D/C 流水线 | "有 91 个任务分布在研究中/开发文档/编码三阶段" |
| 阻断清单 | "哪些组件的信号异常？" |

### 2.2 它回答不了的问题

| 你想知道 | 仪表盘无法回答 |
|---------|-------------|
| 整体进度 | "我们离客户部署还有多远？10 个 PARTIAL 门禁意味着什么？" |
| 当前在做什么 | "91 个任务中，今天在推进的有几个？卡住的在哪？" |
| 关键路径 | "哪条链路上的阻塞会直接推迟客户部署？" |
| 瓶颈位置 | "问题出在哪个 Agent？是 Research Agent 产出太慢还是 Claude Code 接线断裂太多？" |
| 趋势 | "上周和这周相比是在改善还是恶化？" |

---

## 三、Graph 升级：从组件健康到工作流可视化

### 3.1 核心洞察

**开发流程天然是一张图。** 每个任务是一个在图上游走的 token。

```
[TASK BRIEF] → [CONTEXT INJECTOR] → [RESEARCH AGENT]
                                          ↓
                                    [DEV DOC AGENT]
                                          ↓
                                    [CLAUDE CODE]
                                          ↓
                                    [GATEKEEPER]
                                     ↓        ↓
                                  [AUDITOR] [CONTRACT]
                                     ↓
                                  [DEPLOY]
```

token 在节点之间移动。节点的健康不是看它自己亮不亮绿灯——是看 token 在这个节点上停留了多久、有多少 token 卡在这里、上游产出后多久下游才开始消费。

### 3.2 新控制塔的三个视图

**视图一：工作流图（Graph 视图）**

每个组件是一个节点，边表示 token 流转方向。节点的颜色表示实时健康状态（和现在一样），但节点的大小表示"当前有多少 token 在这个节点上"（队列长度），边的粗细表示"最近 24 小时经过这条边的 token 数量"（流量）。鼠标悬停在节点上显示延迟、待办数和最近事件摘要。

**视图二：项目经理仪表盘（项目视图）**

回答"建到哪了"、"还差什么"、"什么时候能交付"。17 个门禁不是 pass/partial/fail 的平面列表——是按 MVS 阶段分组：客户部署必须先完成什么（Gate 1-3、Gate 7、Gate 12 中的部分条件）、可以并行推进什么（Gate 8-11、Gate 15）、Phase 2 延期的又是什么（Gate 0/4/5/13 的运行时验证）。每个分组有进度条，直接连接到开发 session 的任务状态。

**视图三：Agent 链路健康（流动视图）**

回答"问题出在哪个 Agent"。不是看 Agent 的成功/失败率——是看 Agent 之间的流转效率：Research→Dev Doc 的产物传递是否一致、Dev Doc→Claude Code 的 spec 实施偏差、Claude Code→Gatekeeper 的提交通过率。每个 Agent 之间的边显示转化率。发现衰减最大的边（Research→Dev Doc 的产物理解偏差）比发现某个 Agent 的个别失败更根本地改善开发效率。

### 3.3 数据流

```
Git log + Task briefs + Signal files
          ↓
    Graph Builder (新)
          ↓
    ┌─────┼─────┐
    ↓     ↓     ↓
  Graph   PM   Flow
  View   View  View
```

三个视图消费同一份图数据——不需要三种数据源。

---

## 四、实施计划

### 4.1 清理阶段：移除死代码

| 操作 | 文件 | 原因 |
|------|------|------|
| 移除 | scripts/tmp/ (8 个文件) | 临时构建脚本 |
| 移除 | scripts/_fix_parser.py, test_write.py, temp_build_report.py | 一次性调试脚本 |
| 移除 | scripts/workflow/verify-v440.sh, verify-v444.sh | 旧版本, verify-incremental.sh 已替代 |
| 合并 | scripts/wire-check.sh, scripts/checks/check-wire-full.sh, scripts/workflow/wire-check.sh | 三合一 |
| 合并 | scripts/hook-block-no-q0.sh → hook-block-write.sh | 功能重叠 |
| 归档 | scripts/research/gen-survey.py, translate-research.py | 一次性的研究工具 |
| 移除 | scripts/audit/__pycache__, scripts/control-tower/__pycache__ | 构建缓存, 不是源代码 |

### 4.2 升级阶段：Graph 控制塔

| 步骤 | 内容 | 依赖 |
|:---:|------|------|
| 1 | Graph Builder — Python 脚本从 git log + task briefs + signal files 构建工作流图 | 无 |
| 2 | 工作流图视图 — 替换当前 6 组件信号卡片为交互式节点图 | 步骤 1 |
| 3 | 项目经理仪表盘 — MVS 分组门禁 + 关键路径 + 完成预估 | 步骤 1 |
| 4 | Agent 链路健康视图 — Agent 间流转效率 + 衰减检测 | 步骤 1 |
| 5 | 淘汰旧视图 — 当前的 6 组件信号卡片并入 Graph 视图的节点悬停信息中 | 步骤 2 |

### 4.3 保留不变

- emit-signal.py — 信号发射保持不变
- check-gates-v2.py — 门禁检查保持不变
- synova-commit + pre-commit-check.sh — 网守保持不变
- 6 个控制塔组件脚本 — 功能不变, 输出格式不变
- gate-status.json, *.signal.json — 数据源不变
