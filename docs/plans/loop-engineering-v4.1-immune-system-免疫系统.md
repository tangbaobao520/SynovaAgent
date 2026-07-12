# Loop Engineering V4.4.5 — Immune System / 免疫系统工程

> V4.0 定位了问题（需要 loop 层），V4.1 给出解法（免疫细胞自动执行）。
> V4.2~V4.4 将免疫系统从 7 个细胞扩展到 20+，覆盖 engine-core 清零、壳包检测、时间戳验证等场景。
> V4.4.5 新增：grep 物理门禁 + 侧翼修复自动化（改前先 grep，阻断未知侧翼断裂）。
> 核心洞察：hook-check-memory 有能力在 PreToolUse 自动运行 bash 命令——这个能力从未被用于"免疫"。
> V4.1 起，每个 `memory/` 条目变成一个可自动执行的 **免疫细胞**。

---

## 零、免疫系统总览

### 错误实例 vs 错误类别

```
错误实例: "Batch 3 忘了检查 sensitivity-rules.ts 是否仍活跃"
错误类别: "新建模块前未确认旧系统是否仍在运行" ← 双数据源类

15 个实例 → 1 个类别 → 1 个约束
```

一次约束 = 防一个**类别**，不是防一个实例。

### 分级信任模型（L1→L2→L3）

| 第几次出现 | 动作 | 约束行为 |
|-----------|------|---------|
| 第 1 次（新类别） | 写入 memory/，`severity: warn` | hook-check-memory 匹配到 → 运行约束 → 写入 STATE.md |
| 第 2 次（同类别再现） | 手动升级 `severity: block` | 阻断 PreToolUse Write |
| 第 3 次（约束被绕过） | 约束本身有 bug → 修复约束 | 不是错误重复——是门禁失效 |

### 免疫细胞数据结构

```yaml
# memory/dual-source-fraud.md
---
name: dual-source-fraud
class: created-module-without-checking-old-system
constraint: "grep -rn 'SOGNodeType\|...' src/ --include='*.ts' | grep -v 'extensions/\|import type\|\.test\.' | wc -l"
expected: 0
severity: block
occurrences: 15
first_seen: 2026-06-22
upgraded_to_block: 2026-06-23
description: 新建文件驱动模块前必须确认旧硬编码系统是否仍在 src/ 中活跃。15 次历史。
---
```

---

## 一、架构：免疫层插入

```
📋 任务启动 (人工)   →  task-start.sh — 6 核心字段 + 可选 plan.json
🧠 写前注入 (自动)    →  hook-check-memory.sh — 历史教训 + 免疫细胞执行
✍️ 写后验证 (自动)    →  verify-incremental.sh — L1 oxlint → L2 tsc → L3 vitest → L4 接线
🔴 提交阻断 (自动)    →  pre-commit 8 组 — bash 只做物理验证
🚀 推送阻断 (自动)    →  pre-push 1 项 — secrets 终扫
🎯 提交后检测 (自动)  →  post-commit — --no-verify 绕过检测 + 决策建议
```

### PreToolUse 三钩子

```
🧠 PreToolUse 写前检查
    ├─ hook-check-memory.sh ← 扫描 task brief → 匹配 memory/ → 免疫细胞 bash 约束
    ├─ hook-block-write.sh ← 6 字段 + Q0 grep-output + 接口审计 + 层级确认
    └─ hook-enforce-loop.sh ← loop-state 循环检查
```

---

## 二、核心机制

### 机制 1：免疫细胞自动执行（hook-check-memory.sh）

匹配到 memory 文件 → 读取 `constraint` 字段 → 执行 bash 命令 → 比较 `expected` → `severity=block` 阻断 / `severity=warn` 写入 STATE.md

### 机制 2：错误沉淀 + 自动分类

Q0c 审计完成后运行 → 自动生成 memory/ 条目。第一次出现 → `severity: warn`。下一次匹配到同一类别 → 手动升级为 `block`。如果已有同 `class` 的条目 → 更新 `occurrences` +1。

### 机制 3：STATE.md 累积警告

每次 `severity: warn` 的约束被触发 → 写入 STATE.md 免疫警告表。累计次数 ≥ 2 → 决策升级。

---

## 三、现有 20+ 免疫细胞（V4.4.5）

### V4.1 核心 7 个

dual-source-created (block) / plan-actual-mismatch (block) / q0-skipped (block) / q0c-cancelled-without-followup (warn→block) / info-injection-ignored (warn) / grep-semantic-overreach (block) / lessons-file-lost (warn)

### V4.2 新增

stub-implementation-pattern #8 (block) / plan-actual-closure #9 (warn) / engine-core-bridge-files #11 (block) / timestamp-order #18 (block) / q2-exclusion-violation #19 (block) / verify-command-autogen #20 (block)

### V4.4.5 新增：grep 物理门禁

grep-refs-before-write #24 (block) / side-fix-automation #25 (warn)

### V4.4.2 新增：壳包检测

engine-core-shell-package #21 (block) / engine-core-relative-path #22 (block) / packages-engine-core-ref #23 (block)

---

## 四、V4.4.5 vs V4.1

| 维度 | V4.1 | V4.4.5 |
|------|------|--------|
| pre-commit 组数 | 7 组 | **8 组** |
| 免疫细胞数 | 7 | **20+** |
| 桥接文件检测 | 无 | **三重匹配：字面量 + 相对路径 + 壳包** |
| 扫描范围 | src/ 仅 | **src/ + packages/** 全仓库 |
| 验证范围 | plan.json 一致性 | +Q2排除项验证 + verify自动生成 + 时间戳顺序 |
| 改前 grep | 无 | **grep-refs 物理门禁 + 侧翼修复自动化** |

---

## 五、V4.1→V4.4.5 关键演化

### engine-core 清零（V4.2.2→V4.2.4）
V4.1 时 289 文件被 src/ 引用 → V4.2.2 删 8 桥接文件 → V4.2.4 删 4 白名单 → V4.4.2 扩展扫描到 packages/

### 时间戳顺序检查（V4.2.5）
PreToolUse 检测 brief 未填而写代码 → 写证据到 `/tmp/.synova-before-brief` → pre-commit 硬阻断

### Q2 排除项验证（V4.2.6）
pre-commit 自动解析 Q2 排除项文件路径 → 检查 git diff → 包含则硬阻断

### 壳包检测（V4.4.2）
`packages/*/src/` 下仅 index.ts + 全 export from + <50行 + 引用 engine-core → 壳包硬阻断

### grep 物理门禁 + 侧翼修复自动化（V4.4.5）
改代码前 `bash scripts/workflow/grep-refs.sh "符号"` 自动扫描全仓库引用 → 写入 `.claude/reference-map.md` → `hook-block-write.sh` 检查 `.claude/grep-verified` 门禁文件 → 未 grep 则阻断 Write/Edit

---

## 六、实施状态

| 步骤 | 状态 |
|------|------|
| memory/ YAML frontmatter schema | ✅ V4.1 |
| hook-check-memory 改造 | ✅ V4.1 |
| check-lessons-learned.sh | ✅ V4.1 |
| STATE.md 模板 | ✅ V4.1 |
| 7 免疫细胞 | ✅ V4.1 |
| engine-core 桥接清零 | ✅ V4.2.2-4 |
| 时间戳顺序检查 | ✅ V4.2.5 |
| Q2排除项物理验证 | ✅ V4.2.6 |
| 壳包检测 + 全仓库扫描 | ✅ V4.4.2 |
| grep 物理门禁 + 侧翼修复自动化 | ✅ V4.4.5 |

---

## 七、验收标准

V4.4.5 验收：
1. memory/ 目录 ≥ 20 个条目（含 constraint 字段）
2. hook-check-memory 每次匹配后运行约束
3. STATE.md 在每次 warn 触发后追加记录
4. AI 自律依赖 = 0
5. `grep -r 'packages/engine-core\|../../engine-core\|../engine-core' src/ packages/*/src/` 零结果
6. 壳包检测生效
7. `bash scripts/workflow/grep-refs.sh` 存在且 `hook-block-write.sh` 检查 `.claude/grep-verified` 门禁

---

> **参考**：SynovaAgent memory/ · 47 iron laws · 21 check scripts · CLAUDE.md V4.4.5
