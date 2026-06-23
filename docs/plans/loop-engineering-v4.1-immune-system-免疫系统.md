# Loop Engineering V4.1 — Immune System / 免疫系统工程

> V4.0 定位了问题（需要 loop 层），V4.1 给出解法。
> 核心洞察：hook-check-memory 有能力在 PreToolUse 自动运行 bash 命令——这个能力从未被用于"免疫"。
> V4.1 把每个 `memory/` 条目变成一个可自动执行的 **免疫细胞**。

---

## 零、免疫系统总览

### 错误实例 vs 错误类别

```
错误实例: "Batch 3 忘了检查 sensitivity-rules.ts 是否仍活跃"
错误类别: "新建模块前未确认旧系统是否仍在运行" ← 双数据源类

15 个实例 → 1 个类别 → 1 个约束
```

一次约束 = 防一个**类别**，不是防一个实例。如果 Batch 1 第一个双数据源出现后就植入约束，后面 14 个不会发生。

### 分级信任模型（L1→L2→L3）

| 第几次出现 | 动作 | 约束行为 |
|-----------|------|---------|
| 第 1 次（新类别） | 写入 memory/，`severity: warn` | hook-check-memory 匹配到 → 运行约束 → 输出异常 → 写入 STATE.md 警告 |
| 第 2 次（同类别再现） | 手动升级 `severity: block` | 约束输出异常 → 阻断 PreToolUse Write |
| 第 3 次（约束被绕过） | 约束本身有 bug → 修复约束 | 不是错误重复——是门禁失效 |

### 免疫细胞数据结构

```yaml
# memory/dual-source-fraud.md
---
name: dual-source-fraud
class: created-module-without-checking-old-system
constraint: "grep -rn 'SOGNodeType\|ProviderType\|SEED_FRAMEWORKS\|DEFAULT_POLICIES\|DEFAULT_EXPERTS\|SIGNAL_TO_EXPERT' src/ --include='*.ts' | grep -v 'extensions/\|import type\|\.test\.' | wc -l"
expected: 0
severity: block
occurrences: 15
first_seen: 2026-06-22
upgraded_to_block: 2026-06-23
description: 新建文件驱动模块前必须确认旧硬编码系统是否仍在 src/ 中活跃。15 次历史。
---
```

**字段说明**：

| 字段 | 必须 | 用途 |
|------|------|------|
| `name` | ✅ | 唯一标识符 |
| `class` | ✅ | 错误类别 ID（同一类别的多个实例共享同一个 class） |
| `constraint` | ✅ | bash 命令，在 PreToolUse 自动运行。输出与 `expected` 比较 |
| `expected` | ✅ | 约束命令的期望输出。如 `0`（零匹配）或空字符串 |
| `severity` | ✅ | `warn`（写入 STATE.md）/ `block`（阻断 PreToolUse） |
| `occurrences` | ✅ | 历史累计次数（每次触发 +1） |
| `first_seen` | ✅ | 首次记录日期 |
| `upgraded_to_block` | ⚠️ | severity 从 warn 升级为 block 的日期 |
| `description` | ✅ | 人类可读描述 |

---

## 一、架构：免疫层插入

```
📋 任务启动 (人工)
    ↓
🧠 PreToolUse 写前阻断
    ├─ hook-check-memory.sh ← 扫描 task brief 关键词 → 匹配 memory/
    │   └─ 🆕 匹配到 → 读取 constraint 字段 → 执行 bash 命令
    │       ├─ 输出 = expected → ✅ 放行
    │       ├─ 输出 ≠ expected + severity=warn → ⚠️ 写入 STATE.md
    │       └─ 输出 ≠ expected + severity=block → ❌ 阻断 Write
    ├─ hook-block-write.sh ← 6 字段 + Q0 grep-output
    └─ hook-enforce-loop.sh ← loop-state
    ↓
✍️ 写代码
    ↓
✍️ PostToolUse 写后验证
    ↓
🔴 pre-commit 7 组
    ↓
🔵 Loop 层（提交后）
    ├─ check-plan-closure.sh
    ├─ check-lessons-learned.sh ← 🆕 错误沉淀 → 写入 memory/ + 初始化 severity=warn
    └─ loop-audit.sh
```

---

## 二、核心机制

### 机制 1：免疫细胞自动执行（改造 hook-check-memory.sh）

**现状**：hook-check-memory.sh 匹配到 memory 文件 → 输出摘要到 system-reminder → agent 无视。

**改造后**：匹配到 memory 文件 → 读取 `constraint` 字段 → 执行 bash 命令：

```bash
# hook-check-memory.sh 新增逻辑（伪代码）
for matched_memory in $MATCHED_MEMORIES; do
  # 提取 YAML frontmatter
  CONSTRAINT=$(extract_field "$matched_memory" "constraint")
  EXPECTED=$(extract_field "$matched_memory" "expected")
  SEVERITY=$(extract_field "$matched_memory" "severity")

  if [ -n "$CONSTRAINT" ]; then
    ACTUAL=$(eval "$CONSTRAINT" 2>/dev/null || echo "ERROR")

    if [ "$ACTUAL" != "$EXPECTED" ]; then
      # 更新 occurrences 计数
      increment_occurrences "$matched_memory"

      if [ "$SEVERITY" = "block" ]; then
        echo "⛔ 免疫阻断: $(basename $matched_memory)"
        echo "   约束: $CONSTRAINT"
        echo "   期望: $EXPECTED, 实际: $ACTUAL"
        echo "   历史: $(extract_field $matched_memory 'occurrences') 次"
        exit 1
      else
        echo "⚠️ 免疫警告: $(basename $matched_memory) → STATE.md"
        append_to_state "$matched_memory" "$ACTUAL"
      fi
    fi
  fi
done
```

### 机制 2：错误沉淀 + 自动分类（改造 check-lessons-learned.sh）

**现状**：Q0c 审计发现错误 → agent 手动写 memory/（或忘记写）。

**改造后**：Q0c 审计完成后运行 → 自动生成 memory/ 条目：

```bash
check-lessons-learned.sh "dual-source-fraud" \
  --class "created-module-without-checking-old-system" \
  --constraint "grep -rn 'SOGNodeType' src/ --include='*.ts' | grep -v extensions/" \
  --expected "0" \
  --severity "warn" \
  --description "新建模块前未确认旧系统是否仍在运行"
```

第一次出现 → `severity: warn`。下一次匹配到同一类别 → 手动升级为 `block`。

**分类去重**：如果已有同 `class` 的条目 → 更新 `occurrences` +1，不新建条目。如果 `occurrences >= 2` → 提示"建议升级为 block"。

### 机制 3：STATE.md 累积警告

每次 `severity: warn` 的约束被触发 → 写入 STATE.md：

```markdown
## 免疫警告 (2026-06-24)

| 时间 | 错误类别 | 约束输出 | 累计次数 |
|------|---------|---------|---------|
| 10:23 | created-module-without-checking-old-system | SOGNodeType matched 66 files | 16 |
| 10:45 | plan-actual-mismatch | MISSING: 3 files | 2 |
```

人类在 Phase 结束时读 STATE.md。累计次数 ≥ 2 的条目 → 决策"升级为 block 还是修复约束"。

---

## 三、现有 7 个错误类别的免疫细胞

从 V3.9 的 7 个历史错误反向生成：

| # | 错误类别 | 首次出现 | 次数 | severity | constraint（核心逻辑） |
|---|---------|---------|------|----------|----------------------|
| 1 | `dual-source-created` | Batch 1 | 15 | **block** | grep 旧硬编码系统在 src/ 中仍活跃 |
| 2 | `plan-actual-mismatch` | Batch 1-5 | 5 | **block** | diff plan.json files vs git diff |
| 3 | `q0-skipped` | Batch 1-3 | 3 | **block** | Q0b 缺 grep-output 代码块 |
| 4 | `q0c-cancelled-without-followup` | Q0c | 12 | warn | plan.json cancel 项无 follow_up |
| 5 | `info-injection-ignored` | 全部 | ∞ | warn | memory 匹配数 > 0 但 Q1c 未引用 |
| 6 | `grep-semantic-overreach` | V3.6 | 1 | **block** | as any 在注释行中（误报检测） |
| 7 | `lessons-file-lost` | - | 1 | warn | 踩坑录文件缺失检测 |

---

## 四、V4.1 vs V4.0 vs V3.9

| 维度 | V3.9 | V4.0 | V4.1 |
|------|------|------|------|
| 四层栈 | harness | harness + loop | harness + loop + **immune** |
| 重复错误防止 | 无 | 记录（信息注入） | **自动执行 bash 约束 → 物理阻断** |
| hook-check-memory | 信息注入 | 信息注入 | **免疫细胞执行引擎** |
| 错误分类 | 无 | 无 | **class 去重 + occurrences 计数** |
| 分级信任 | 无 | 无 | **L1 warn → L2 block → L3 修复约束** |
| AI 自律依赖 | 0（harness 层） | 0（loop 层） | 0（免疫层：bash 自动执行） |

---

## 五、实施计划

| 步骤 | 内容 | 工时 |
|------|------|------|
| 1 | 定义 memory/ YAML frontmatter schema（constraint/expected/severity/occurrences） | 0.5 天 |
| 2 | 改造 hook-check-memory.sh：匹配后 → 读 constraint → 执行 → 比较 expected | 1 天 |
| 3 | 改造 check-lessons-learned.sh：自动生成 memory/ 条目 + class 去重 | 0.5 天 |
| 4 | 创建 STATE.md 模板 + 警告追加逻辑 | 0.5 天 |
| 5 | 从现有 7 个错误类别生成免疫细胞（反向填充 memory/） | 1 天 |
| 6 | 改造 task-start.sh/scope-check.sh：scope-check 时显示当前活跃的免疫细胞数 | 0.5 天 |
| 7 | 验证：模拟一个已知错误场景 → 免疫细胞阻断 | 1 天 |

---

## 六、验收标准

V4.1 是否成功的唯一可证伪标准：

> 用 Batch 1-4 的任一已知错误场景（如"在 src/ 下新增 SOGNodeType 枚举引用"）模拟一次 commit —— hook-check-memory 匹配到 dual-source-fraud 免疫细胞 → 运行约束 → 输出 ≠ expected → severity=block → PreToolUse 阻断，不准写代码。

再加上：
1. memory/ 目录下 ≥ 7 个条目（含 constraint 字段）
2. hook-check-memory 每次匹配后运行约束（bash -x 可验证）
3. STATE.md 在每次 warn 触发后追加记录
4. 所有新增脚本通过 pre-commit 8 组
5. AI 自律依赖 = 0

---

> 参考：cobusgreyling loop-engineering (anti-patterns, LOOP.md, failure-modes, L1→L3 rollout) · 橙皮书 (四层栈、四个代价) · how-claude-code-works (27 Hook events, PreToolUse) · SynovaAgent memory/ · 47 iron laws · 21 check scripts · Q0c 15 findings
