# Loop Engineering V4.0 — Zero-AI-Discipline Engineering / 零AI自律工程

> 基于 cobusgreyling loop-engineering、橙皮书四层栈、Claude Code Hooks 架构、V3.9 15 项发现、memory/ 7 个文件、21 个 check 脚本、47 条铁律的 100% 通读结果。
>
> **V3.9 处于四层栈的 harness 层（检查代码质量）。V4.0 必须上到 loop 层（验证承诺交付）。**
> 核心原则来自 cobusgreyling：**"You shouldn't be prompting coding agents anymore. You should be designing loops that prompt your agents."**

---

## 一、四层栈定位

```
loop 层  ← V4.0 新增: 承诺验证 + Plan-Actual 闭合 + 踩坑录闭环
harness 层 ← V3.9: 8 组 pre-commit + structured-proofs
context 层 ← CLAUDE.md + memory/ + task brief
prompt 层 ← 用户输入
```

V3.9 在 harness 层已经足够好。V4.0 不改 harness 层——**在它之上加 loop 层，形成闭环**。

---

## 二、参考项目核心教训

### cobusgreyling loop-engineering

| 教训 | 应用 |
|------|------|
| Five Building Blocks + Memory | V4.0 强化 Memory/State 为物理强制 |
| Anti-pattern #4: L3 before L1 quality | **我们的致命伤**：从 V3.0 开始就直接 L3（硬阻断提交），从未经过 L1（报告）→ L2（辅助）的信任积累 |
| LOOP.md 自描述循环 | 创建 `LOOP.md` 描述维护 SynovaAgent 自身的循环 |
| Human Gate | V4.0 加 Plan-Actual 不匹配时的人类决策点 |
| loop-audit 就绪度评分 | 创建 `loop-audit.sh`：门禁系统自身的健康度仪表盘 |

### 橙皮书

| 教训 | 应用 |
|------|------|
| 四层栈 | 明确 V4.0 的定位是 harness → loop 升级 |
| 四个代价 | 验证债（pizza-chain 空壳）、理解腐烂（memory 被无视）— V4.0 直接针对 |
| 五个动作 | 触发、孵化、验证、记录、决策 — V3.9 只有触发+验证，缺记录+决策 |

### Claude Code Hooks

| 教训 | 应用 |
|------|------|
| 27 个 Hook 事件覆盖完整生命周期 | V3.9 只用了 PreToolUse + PostToolUse + SessionStart（3/27）。不需要全用，但 SessionEnd 和 TaskCompleted 是缺失的关键事件 |
| Plan mode：权限降级换取信任 | Plan 模式的精髓：先只读 → 输出计划 → 审批 → 恢复写权限。我们的 Plan mode 已经做到了前两步，但缺第三步的"审批后锁定" |
| State machine 对称性 | 每个状态转换都要可回退。我们的 workflow-state.json 做到了 |

---

## 三、V4.0 架构

### 不变（V3.9 harness 层，已经正确）

```
PreToolUse (写前阻断)
  ├─ hook-check-memory.sh → 信息注入（保留为上下文，不升级）
  ├─ hook-block-write.sh → 6 字段 + Q0 grep-output 强制
  └─ hook-enforce-loop.sh → loop-state 物理阻断

PostToolUse (写后验证)
  └─ verify-incremental.sh → L1 oxlint → L2 tsc → L3 vitest → L4 接线

pre-commit (提交阻断 — 7 组物理验证)
  ├─ 组 1: 类型安全 (as any + 硬编码)
  ├─ 组 2: 测试质量 (catch + 配对 + 桩测试)
  ├─ 组 3: Secrets
  ├─ 组 4: 接线完整性
  ├─ 组 5: 架构边界 + 桥接文件
  ├─ 组 6: 结构化证明验证 (Q0b grep-output + Q1c memory-ref + plan-actual-diff)
  └─ 组 7: 文件驱动完整性 (manifest/tags/回归/目录/CI)
```

### 新增（V4.0 loop 层 — 闭合承诺验证链）

```
Loop 层 (提交后 + 阶段结束时触发)
  ├─ check-plan-closure.sh → Plan vs Actual diff → 写入 STATE.md
  ├─ check-lessons-learned.sh → 错误沉淀 → 写入 memory/
  └─ loop-audit.sh → Loop 系统自身健康度评分
```

---

## 四、三项新增机制

### Loop 机制 1：Plan-Actual 闭合（解决根因 2）

**触发时机**：post-commit hook + Phase 结束时手动触发。

```
Plan 文件清单 (从 plan.json phases[].files)
    vs
Actual 文件清单 (git diff plan-start..HEAD)
    ↓
check-plan-closure.sh
    ├─ 全部匹配 → ✅ 写入 STATE.md: "Phase N closed"
    ├─ Plan 有 Actual 无 → ⚠️ STATE.md: "MISSING: {files}" → 下次 pre-commit 警告
    └─ Actual 有 Plan 无 → ❌ pre-commit 硬阻断: "文件未在 Plan 中声明"
```

**为什么是 loop 层不是 harness 层**：Plan-closure 检查的时机是"阶段结束"，不是"每次提交"。它在 post-commit 写入 STATE.md，下一次 pre-commit 读取 STATE.md 检查未闭合的 gap。

### Loop 机制 2：踩坑录自动沉淀（解决根因 3）

**触发时机**：Q0c 审计完成后 + Q0c cancel 任务的 follow_up 被标记为 `done` 时。

```
每个错误 → check-lessons-learned.sh
  ├─ 写入 memory/{date}-{slug}.md (YAML frontmatter + Why + How)
  ├─ 更新 MEMORY.md 索引
  └─ CLAUDE.md 铁律注释自动加 "来源: memory/{slug}.md"
```

**为什么是 loop 层**：错误沉淀不需要在提交时阻断——它在 Q0c 审计循环中自然发生。但脚本确保它**一定发生**（不依赖 agent 自觉）。

### Loop 机制 3：LOOP.md + loop-audit.sh（系统自检）

**LOOP.md**：描述 SynovaAgent 自身的维护循环。格式参照 cobusgreyling：

```markdown
# LOOP.md — SynovaAgent 自维护循环

## Active Loops
### pre-commit Gate (L3 — automated blocking)
- Cadence: every git commit
- Skill: pre-commit-check.sh (8 组)
- State: .claude/pre-commit-failures.log + .claude/bypass.log

### Q0c Audit (L2 — assisted, post-Batch)
- Cadence: each Batch completion
- Skill: reverse Q0c audit (check-q0c-tracking.sh)

### Lessons Learned (L1 — report, post-Q0c)
- Skill: check-lessons-learned.sh → memory/
```

**loop-audit.sh**：评分 loop 系统自身的健康度。

```bash
loop-audit.sh
  ├─ pre-commit 失败率 (24h) → <5 = ✅, 5-10 = ⚠️, >10 = ❌
  ├─ Plan-Actual 闭合率 → 100% = ✅, <100% = ❌
  ├─ memory/ 条目数 vs 铁律数 → >=铁律数 = ✅
  ├─ 软机制数量 → 必须 = 0
  └─ 输出: Loop Readiness Score (0-100)
```

**loop-audit 不阻断提交。** 它只评分。评分下降时 — 人类决定是否检修。

---

## 五、V4.0 vs V3.9 对比

| 维度 | V3.9 | V4.0 |
|------|------|------|
| 四层栈层级 | harness 层 | harness + loop 层 |
| Plan-Actual 闭合 | 无 | post-commit → STATE.md → pre-commit 读取 |
| 踩坑录沉淀 | 无 | check-lessons-learned.sh 自动写入 memory/ |
| 系统自检 | 无 | LOOP.md + loop-audit.sh |
| AI 自律依赖 | 0 项（harness 层） | 0 项（loop 层也需要人类触发） |
| 人类决策点 | 0 | 1 — Plan-Actual 不匹配时升级到人类 |
| 检查总数 | 10（7 组 + 3 证明） | 10 + 3 loop 检查 = 13 |

**V4.0 没有删除任何 V3.9 检查。** Harness 层全部保留。Loop 层是新增的**外层循环**，不增加单次提交的负担。

---

## 六、实施计划

| 步骤 | 内容 | 工时 |
|------|------|------|
| 1 | LOOP.md — 描述 SynovaAgent 自维护循环 | 0.5 天 |
| 2 | check-plan-closure.sh — Plan vs Actual diff | 1 天 |
| 3 | check-lessons-learned.sh — 错误沉淀到 memory/ | 0.5 天 |
| 4 | loop-audit.sh — Loop 系统健康度评分 | 1 天 |
| 5 | CLAUDE.md 更新 — 铁律注释加 来源: memory/ | 0.5 天 |
| 6 | 验证 — 跑 loop-audit，确保评分可计算 | 0.5 天 |

---

## 七、V4.0 验收标准

V4.0 是否成功的唯一可证伪标准：

1. `loop-audit.sh` 输出 ≥ 80 分的 Loop Readiness Score
2. `LOOP.md` 存在且描述了 ≥ 3 个活跃循环
3. `memory/` 目录下 ≥ 47 个条目（每个铁律一条）
4. 所有新增脚本通过 pre-commit 8 组
5. AI 自律依赖 = 0

---

> 参考：
> - cobusgreyling/loop-engineering (README, anti-patterns, LOOP.md, loop-audit)
> - 橙皮书《别再问我什么是 Loop Engineering》(四层栈、四个代价、五个动作)
> - how-claude-code-works-main (27 Hook events, Plan mode state machine)
> - agentic-ai-engineering-main (agent testing + evaluation patterns)
> - SynovaAgent memory/ 7 files + CLAUDE.md 47 iron laws + 21 check scripts
> - SynovaAgent Batch 1-5 actual execution records + Q0c 15 findings
