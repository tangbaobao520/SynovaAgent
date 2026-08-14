<!--
  Synova 创始人控制塔系统 -- 第一章：上下文注射器
  Version:  v1.0 | Date: 2026-07-22
  Author: Codex + DeepSeek V4 Pro (研究Agent)
  Status: 研究完成，待实现

  V4.4.5 对齐:
    铁律 0-3: 本文档基于 Get-Content 读取 generate-task-brief.py、hook-check-memory.sh、
              hook-block-write.sh、hook-session-start.sh、system-registry.json、
              权威文档01-第二章-42条因果边权威定义（前100行）、generate-task-brief.py 全文。
    铁律 0-4: Test Requirements (section 11) + Wiring Verification (section 11.3) 已包含。
    铁律 0-5: 自检清单附于文末。
-->

# 创始人控制塔 -- 第一章：上下文注射器

> **根问题不是在"Agent应该记得去读文档"。根问题是Agent在开始思考时，
> 上下文窗口里没有这些信息。** 上下文注射器的设计哲学：让关键信息在
> Agent睁开眼睛之前就已经在那里——不需要记忆，不需要自律，不需要钩子提醒。

---

## 目录

1. [问题定义与23项已知错误的根因分析](#1-问题定义)
2. [架构总览 -- 注射器在整个流水线中的位置](#2-架构总览)
3. [上下文注射器工作流程](#3-工作流程)
4. [注入片段格式规范](#4-注入片段格式)
5. [版本一致性验证](#5-版本一致性验证)
6. [失败模式与降级策略](#6-失败模式)
7. [权威文档ID映射表](#7-权威文档id映射)
8. [与已有体系的集成方案](#8-集成方案)
9. [具体实现：脚本设计](#9-脚本设计)
10. [存储规范](#10-存储规范)
11. [测试规范与接线要求](#11-测试与接线)
12. [验收标准](#12-验收标准)

---

## 1. 问题定义

### 1.1 根因分析

Synova三阶段AI Agent流水线中存在23项已知错误（AGENTS.md 铁律0-5）。
抽取其中可直接追溯至"上下文缺失"的几条：

| 错误# | 描述 | 根因分类 | 上下文注射器是否覆盖 |
|--------|------|---------|-------------------|
| 1 | 不读权威文档就写（D8f Synthesizer vs 仲裁历史） | Agent不知道文档内容 | **是** -- 注射后文档关键定义已在窗口 |
| 3 | 不写接线要求（没有具体调用方路径） | Agent不知道哪些文件需要接线 | **是** -- 注入调用方文件路径 |
| 5 | Edge ID标签错误（D26: 3/5写错） | Agent凭记忆编造Edge ID | **是** -- 注入Edge ID清单 |
| 22 | 引用不存在的文件不验证（knowledge-curator.ts） | Agent不知道哪些文件真实存在 | **是** -- 注入文件路径验证结果 |
| 23 | 声称并行但实际有冲突（D97+D98同时写app.css） | Agent不知道文件归属边界 | **部分** -- 注入模块边界定义 |

核心洞察：**5/23 项错误（约22%）的根因是Agent在做决策时上下文中缺少权威信息。**
这些错误不是Agent"不够好"——是信息从未到达它的上下文窗口。

### 1.2 为什么现有体系没解决这个问题

现有体系已经尝试过"开卷考试"方案：

```
hook-check-memory.sh: 扫描 task brief 关键词 -> 匹配 memory/*.md -> 输出教训摘要
```

但 [info-injection-ignored.md](D:/novis-backup-20260526/Novis/synova-agent/memory/info-injection-ignored.md) 记录了残酷的事实：

> "信息注入型检查被 agent 系统性无视。hook-check-memory 每次运行都注入教训但从未被吸收。
> 约束: 如果 memory-match.json 有匹配但 Q1c 未引用 -> warn。升级为 block 条件：
> 同一条 memory 被 warn 3 次且 Q1c 仍不引用。"

**hook-check-memory 的输出在 stderr/stdout —— Agent可以选择不读。**
上下文注射器的解决方案不同：**直接写入task brief正文**。Agent打开brief时，
关键信息已经是brief的一部分——它不可能跳过，因为它在同一个文档里。

### 1.3 设计原则

1. **不是提醒Agent去读，是把关键片段嵌入Agent的上下文窗口。** 物理上不可跳过。
2. **不是全文注入，是结构化摘要。** 提取 Edge ID、参数名、正常范围、来源路径、版本commit。
3. **版本同步。** 注入的每个字段标注来自哪个版本的权威文档——Agent知道它在引用什么。
4. **静默降级。** 无权威文档引用->静默通过。文档版本不一致->注入最新+告警（不阻断）。
5. **存储审计。** 每次注入的内容和版本持久化到 `.codex/settings/injections/{task-id}.json`。

---

## 2. 架构总览

### 2.1 注射器在三阶段流水线中的位置

```
研究Agent (Codex + DeepSeek V4 Pro)
    v 产出: task brief (手写或generate-task-brief.py生成)
    v
【上下文注射器介入点】 <-- 本章实现
    v 读取 task brief -> 解析权威文档ID -> 提取片段 -> 写回 brief Q1c
    v
开发文档Agent (Codex + DeepSeek V4 Pro)
    v 消费: task brief（含 Q1c注入片段）-> 写 SPEC.md / dev doc
    v
编码Agent (Claude Code + DeepSeek V4 Flash)
    v 消费: task brief + SPEC.md -> 写代码
```

### 2.2 在现有PreToolUse钩子链中的插入位置

当前钩子链（来自 `.codex/hooks.json`）：

```
PreToolUse (Edit|Write):
  1. hook-check-memory.sh    -- 从 memory/ 注入历史教训 (stdout, Agent可选读)
  2. hook-block-write.sh     -- task brief 字段质量检查 + 流程锁 (硬阻断)
  3. hook-enforce-v25.sh     -- loop-state 验证 (硬阻断)
```

上下文注射器插入为 **新步骤 0**（在 memory注入之前，因为它是物理写入brief的，不依赖Agent读取）：

```
PreToolUse (Edit|Write):
  0. hook-inject-context.sh     -- 【新增】上下文注射器 (写brief Q1c)
  1. hook-check-memory.sh       -- memory教训注入 (stdout，保留)
  2. hook-block-write.sh        -- brief质量检查 (硬阻断)
  3. hook-enforce-v25.sh        -- loop-state验证 (硬阻断)
```

**为什么放在步骤 0？**
- 上下文注射器直接修改brief文件——它必须在block-write检查之前完成，因为block-write会确认brief是完整的
- memory注入是补充性的（stdout）——历史教训与权威定义同时到达Agent窗口，两者互补
- block-write读取的brief已经是注射后的版本——意味着注射后的brief也经过有效性检查

---

## 3. 工作流程

### 3.1 完整流程图

```
Step 0: Agent启动前 -> PreToolUse hook触发
          v
Step 1: 定位task brief
          +-- 存在 -> 继续
          +-- 不存在 -> 静默退出 (exit 0, 不阻断)
          v
Step 2: 解析Q1c字段
          +-- Q1c已存在 -> 跳过 (避免重复注入)
          +-- Q1c不存在 -> 继续
          v
Step 3: 提取权威文档引用
          +-- 扫描brief中 "权威文档\d+" / "DOC-\d+" 模式
          +-- 匹配 authoritative-docs-map.json 中的映射
          +-- 至少一个匹配 -> 进入提取流程
          +-- 零匹配 -> 静默通过 (exit 0)，写入空注入记录
          v
Step 4: 版本一致性验证
          +-- git log -1 --format="%H" -- <doc_file>
          +-- 对比上次注入记录的commit hash (如果存在)
          +-- 一致 -> 使用缓存版本
          +-- 不一致/无记录 -> 重新提取 + 版本告警
          v
Step 5: 提取关键片段
          +-- 每个权威文档按分类模板解析：
          |   - 权威文档01(因果边) -> 提取表格中的 Edge ID + 参数名 + 正常范围
          |   - 权威文档03(哨兵)   -> 提取 sentinel-id + compute函数 + 专家路由
          |   - 权威文档06(测试)   -> 提取 L1/L2a/L2b/L2c 层定义 + fixture类型
          |   - 权威文档13(增长)   -> 提取 增长导航阶段 + 入口API + Done标准
          |   - 其他                -> 提取 ##标题层级 + 文件路径引用
          +-- 格式化为结构化注入表 (见 section 4)
          +-- 标注版本commit hash
          v
Step 6: 写入task brief
          +-- 在 Q2 节之前插入 "### c) 上下文注入（自动生成，请勿手动编辑）"
          +-- 写入注入片段表
          +-- 文件末尾追加 "[Q1c注入: 2026-07-22T... commit a1b2c3d]"
          +-- verification: grep 确认 Q1c节存在于brief中
          v
Step 7: 持久化注入记录
          +-- .codex/settings/injections/{task-id}.json
          v
Step 8: 输出告警(仅当有问题时)
          +-- stderr: "[inject-context] 权威文档03版本不一致: 上次 abc123, 当前 def456"
```

### 3.2 Step 5 提取逻辑：按文档分类的解析模板

#### 模板 A: 因果边文档 (权威文档01)

**触发条件**: doc_id 匹配 `权威文档01`

**解析逻辑**:
```bash
# 提取所有 ### E-XX: 块
# 从每个块中提取参数表格行
# 表格格式: | 参数名 | 含义 | 单位 | 正常范围 | 来源节点属性路径 |
```

**产出格式**:
| Edge ID | 参数名 | 正常范围 | 来源文件路径 |
|---------|--------|---------|-------------|
| E-01 | scan_frequency | 1-3 | Capability.Person/Team.activityCount |
| E-01 | scan_breadth | 3-7 | Capability.Team |
| E-02 | passive_signal_i | 0-1 | Event.Event节点 |
| E-04 | learning_rate | 0.01-0.30 | KnowledgeChunk |

#### 模板 B: 哨兵-计算文档 (权威文档03)

**触发条件**: doc_id 匹配 `权威文档03`

**解析逻辑**: 提取 sentinel_id -> compute函数 -> 专家路由 的三元组

**产出格式**:
| Sentinel ID | Compute函数 | 触发方式 | 来源文件 |
|-------------|------------|---------|---------|
| cash-runway | COMPUTE-IRR-v1 | Cron | extensions/sentinels/cash-runway/ |
| key-person-risk | COMPUTE-DECISION-AUTHORITY-v1 | Cron | extensions/sentinels/key-person-risk/ |

#### 模板 C: 测试体系文档 (权威文档06)

**触发条件**: doc_id 匹配 `权威文档06`

**产出格式**:
| 测试层 | 命名约定 | 覆盖要求 |
|-------|---------|---------|
| L1 | *.test.ts | 正常路径 + 降级 + 边界 |
| L2a | *.integration.test.ts | 真实路由，不mock管线 |
| L2b | *.e2e.test.ts | E2E端到端 |
| L2c | *.contract.test.ts | 契约测试 |

#### 模板 D: 通用/其他文档

**触发条件**: 无专用模板

**解析逻辑**: 提取 `## 标题` + 表格行 + 路径引用 + 函数签名

### 3.3 注入时机总结

| 时机 | 操作 | 条件 |
|------|------|------|
| PreToolUse (每次写操作前) | 检查+注入 | task brief Q1c为空 |
| 注射后 | 跳过 | Q1c已填充（防重复） |
| 注射后 | 失效缓存的触发条件 | 权威文档源文件mtime变更 或 commit哈希变化 |

---

## 4. 注入片段格式

### 4.1 核心格式定义

注入到 task brief 的 Q1c 字段的标准格式：

```markdown
### c) 上下文注入（自动生成，请勿手动编辑）

> 注入: 2026-07-22T14:30:00+08:00 | 版本: commit a1b2c3d4e5
> 来源: hook-inject-context.sh v1.0
> 若以下信息与代码实际不符，以代码 grep 结果为准。

#### 权威文档01: 本体层因果体系 (42条因果边)

文档版本: commit a1b2c3d | 提取字段: Edge ID, 参数名, 正常范围

| Edge ID | 参数名 | 正常范围 | 来源文件路径 |
|---------|--------|---------|-------------|
| E-01 | scan_frequency | 1-3 | Capability.Person/Team.activityCount |
| E-01 | scan_breadth | 3-7 | Capability.Team |
| E-02 | passive_signal_i | 0-1 | Event.Event节点 |
| E-04 | learning_rate | 0.01-0.30 | KnowledgeChunk |
| E-4.1 | talent_density | 0.5-0.9 | Person.capability |
| E-5.1 | revenue_growth_rate | 0.0-0.5 | Financial节点 |

**关键文件路径引用** (来源: 权威文档01):
- src/l4/graph-bridge.ts -- GraphBridge主桥接器
- src/l4/entity-resolver.ts -- EntityResolver实体解析
- packages/engine-core/src/sog-core/types.ts -- SOG-Core类型定义

#### 权威文档06: 测试体系

文档版本: commit c3d4e5f | 提取字段: 测试层, 命名约定

| 测试层 | 命名约定 | 覆盖要求 |
|-------|---------|---------|
| L1 | *.test.ts | 正常路径 + 降级 + 边界 |
| L2a | *.integration.test.ts | 真实路由，不mock管线 |
| L2b | *.e2e.test.ts | E2E端到端 |
| L2c | *.contract.test.ts | 契约测试 |
```

### 4.2 格式设计原则

1. **每行一个字段，不需要二次解析。** Agent看到的直接是结构化数据。
2. **表格不是全文。** 只有参数名/正常范围/文件路径——不需要章节标题或解释文字。
3. **"若以下信息与代码实际不符，以代码 grep 结果为准"** — 反幻觉护栏。
4. **版本标注。** 每章注入显式标注 "文档版本: commit xxxx"。
5. **来源文件路径。** Agent有了grep的精确目标。

### 4.3 注入片段的大小控制

每次注入预计：
- 小任务（引用1个权威文档）: 200-500 bytes
- 中任务（引用2-3个权威文档）: 1-2 KB
- 大任务（引用4+权威文档）: 3-5 KB

这远小于Agent上下文窗口的限制，且物超所值——这些字节节省的是后续多次 `grep` + `read` 的往返时间。

---

## 5. 版本一致性验证

### 5.1 版本追踪机制

```
权威文档文件 -> git log -1 -> commit hash
上次注入记录 -> .codex/settings/injections/{task-id}.json -> cached_hash

对比:
  current_hash == cached_hash -> SKIP (使用缓存，不重新提取)
  current_hash != cached_hash -> RE-EXTRACT + WARN
  无cached_hash               -> EXTRACT (首次注入)
```

### 5.2 一致性检查的具体实现

```bash
get_doc_hash() {
  local doc_file="$1"
  git log -1 --format="%H" -- "$doc_file" 2>/dev/null || echo "NO_GIT"
}

check_consistency() {
  local doc_id="$1"
  local doc_file="$2"
  local cached_hash="$3"

  local current_hash=$(get_doc_hash "$doc_file")

  if [ "$current_hash" = "NO_GIT" ]; then
    echo "[inject-context] WARNING: 无法获取 $doc_id 的git版本信息"
    return 0   # 不阻断
  fi

  if [ -n "$cached_hash" ] && [ "$cached_hash" != "$current_hash" ]; then
    echo "[inject-context] WARNING: $doc_id 版本已更新，上下文已刷新"
    return 126 # 告知调用方需要重新提取
  fi

  echo "$current_hash"
  return 0
}
```

### 5.3 版本警告格式

当版本不一致时，在注入片段末尾追加告警行：

```markdown
> [!WARNING] 版本刷新: 权威文档01在上次注入后已更新 (abc1234 -> def5678)。
> 以上片段已更新为最新版本。请验证变更是否影响当前任务。
```

**关键设计决策：版本不一致不阻断Agent启动。** 理由：
- 阻断会让Agent根本无法开始工作，而我们不知道这个版本变更是否真的会影响当前任务
- Agent已经拿到了最新版本的定义——它有足够信息判断是否需要调整计划
- 如果版本变更导致问题，它会在verify-incremental阶段被捕获

---

## 6. 失败模式

### 6.1 失败模式总表

| 失败模式 | 检测方式 | 行为 | 阻断？ | 降级路径 |
|---------|---------|------|--------|---------|
| task brief 不存在 | `test -f "$BRIEF"` | 静默退出 (exit 0) | 否 | Agent自行工作，无注入 |
| Q1c已存在 | `grep -q "上下文注入" "$BRIEF"` | 跳过 (exit 0) | 否 | 前次注入内容仍有效 |
| 未引用任何权威文档 | `grep -c "权威文档\d+"` = 0 | 静默退出 (exit 0) | 否 | 不是所有任务都需要权威文档 |
| 引用的文档ID不存在 | jq lookup 失败 | **告警 + 拒绝注入 + 通知创始人** | **是** | 创始人手动修正task brief中的doc ID |
| 文档文件不存在 | `test -f "$doc_file"` | 告警 + 跳过该文档 + 继续注入其他文档 | 否 | 注入警告信息到Q1c |
| git不可用 | `git log` 返回错误 | 注入但标注版本=unknown | 否 | 无版本追踪，仅注入内容 |
| 文档格式无法解析 | 提取返回空结果 | 告警 + 注入原始 ## 标题列表 | 否 | 至少Agent知道文档有哪些章节 |
| brief文件不可写 | `test -w "$BRIEF"` | 告警 + 跳过注入 | 否 | Agent从stdout读取注入内容 |

### 6.2 关键失败模式详解

#### 模式 D: 引用的文档ID不存在（硬阻断）

这是唯一会阻断Agent启动的失败模式。场景：

```
创始人手写 task brief:
  "需要新增哨兵权威文档17-地缘政治风险评估。"

注射器扫描: "权威文档17" <-- 不存在于 authoritative-docs-map.json

行为:
  1. stderr: "[inject-context] FATAL: 权威文档17不存在于权威文档映射表中"
  2. stderr: "[inject-context] 可用文档ID: 权威文档01-15"
  3. 写入 .codex/settings/injections/{task-id}.json 的 error 字段
  4. 通知创始人
  5. exit 1 -> PreToolUse hook -> Agent无法写代码
```

**为什么阻断？** 如果创始人引用了一个不存在的文档ID，说明ta认为某个文档存在但实际不存在。让Agent继续工作，它要么：a)凭记忆编造定义，b)找不到参考陷入循环。两者都更糟。

#### 模式 G: 文档格式无法解析（软降级）

```
场景: 权威文档结构已被修改（例如表格格式变化），注射器的正则无法提取字段。

行为:
  1. stderr: "[inject-context] WARNING: 权威文档06格式无法解析，降级为标题注入"
  2. 注入文档的顶级 ## 标题列表 + 文件路径引用（仅结构信息）
  3. Q1c中标注: "解析失败，以下仅为文档结构摘要。请手动读取完整文档。"
  4. exit 0
```

### 6.3 创始人的手动task brief无文档ID引用 -- 降级策略

场景：创始人自己写brief，没有引用任何 `权威文档\d+` 标识，也没有引用 Edge ID。

**降级策略**：
1. 注射器扫描brief -> 零文档ID匹配 -> 静默退出（不注入，不阻断）
2. brief的Q1c字段保持为空
3. Agent仍可从hook-check-memory获取历史教训（那个钩子仍然运行）
4. Agent工作质量取决于创始人在brief中提供了什么信息
5. 如果后续发现缺少权威信息导致错误，创始人可以在后续task brief中显式引用文档ID

核心原则：**不是所有任务都需要权威文档。但需要时，注射器确保Agent必然看到。**

---

## 7. 权威文档ID映射

### 7.1 映射表文件: `scripts/workflow/authoritative-docs-map.json`

此JSON文件是注射器的核心配置，定义每个文档ID到文件路径和提取模板的映射。

```json
{
  "权威文档01": {
    "path": "docs/synova/research/权威文档01-本体层因果体系权威规范-20260714/",
    "primary_file": "SYNOVA-RESEARCH-第二章-42条因果边权威定义-v1-0-20260714.md",
    "category": "causal_edges",
    "template": "A",
    "description": "42条因果边权威定义，含参数表(参数名/正常范围/来源路径)和transfer_function",
    "extracts": ["Edge ID", "参数名", "正常范围", "来源文件路径"],
    "doc_structure": {
      "format": "### E-XX: EDGE_NAME 块",
      "table_pattern": "| 参数名 | 含义 | 单位 | 正常范围 | 来源节点属性路径 |",
      "key_sections": ["transfer_function", "消费的SOG-Core边", "产出的哨兵信号"]
    }
  },
  "权威文档03": {
    "path": "docs/synova/research/权威文档03-哨兵-计算-本体-权威规范-20260710/",
    "primary_file": "SYNOVA-RESEARCH-第一章-哨兵规范-20260710.html",
    "category": "sentinels_computes",
    "template": "B",
    "description": "43个哨兵清单、compute函数映射、专家路由配置",
    "extracts": ["sentinel_id", "compute函数", "layer属性", "auxiliaryExperts"]
  },
  "权威文档06": {
    "path": "docs/synova/research/权威文档06-测试体系权威规范-20260710/",
    "category": "test_standards",
    "template": "C",
    "description": "测试层定义(L1/L2a/L2b/L2c/L3)、fixture类型规范、测试质量要求",
    "extracts": ["测试层", "命名约定", "fixture类型", "覆盖要求"]
  },
  "权威文档13": {
    "path": "docs/synova/research/权威文档13-增长导航系统工程规范-20260714/",
    "category": "growth_navigation",
    "template": "D",
    "description": "增长导航系统的阶段定义、入口API、Done标准模板",
    "extracts": ["增长阶段", "入口API", "Done标准", "关键文件路径"]
  }
}
```

**注**: 完整的15个文档映射将在实现阶段填充至JSON文件。以上展示前4个作为设计示例。

### 7.2 文档ID在task brief中的引用语法

创始人/Agent在task brief中可以通过以下任一方式引用权威文档：

```markdown
## Q0: 定位

本任务需要参考:
- 权威文档01 (因果边定义)
- 权威文档06 (测试体系)

或者简写:
- DOC-01, DOC-06

或在上下文中提及Edge ID:
本任务涉及E-4.1 talent_density, E-5.1 revenue_growth_rate
```

解析器识别模式：
- `权威文档\d+` (中文全称)
- `DOC-\d+` (简写)
- Edge ID (如 `E-\d+\.\d+`) -- 自动解析对应的权威文档01

---

## 8. 集成方案

### 8.1 消费已有体系

| 已有体系组件 | 消费方式 | 说明 |
|-------------|---------|------|
| `task-start.sh` | 注射器读取其产出的task brief | task-start创建brief -> injector填充Q1c -> Agent读取 |
| `hook-check-memory.sh` | 保留不变，在注射器之后运行 | 教训注入 + 权威定义注入 -> Agent获得双层上下文 |
| `hook-block-write.sh` | 注射器在block之前完成 | block-write读取的brief已含Q1c |
| `hook-session-start.sh` | 不修改 | session-locked机制保护整个流程 |
| `system-registry.json` | 注射器读取用于交叉验证 | 注射器交叉比对Edge ID在代码库中是否有对应文件 |
| `generate-task-brief.py` | 建议修改：新增Q1c占位符 | 让brief模板包含 Q1c 空节 |

### 8.2 对generate-task-brief.py的建议修改

在模板的 Q1b 节之后增加 Q1c 占位符：

```python
### c) 上下文注入（自动填充，请勿手动编辑）

<!-- 此节由 hook-inject-context.sh 自动填充。若为空，表示本任务未引用权威文档。 -->
```

### 8.3 对 `.codex/hooks.json` 的修改

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/workflow/hook-inject-context.sh",
            "statusMessage": "注入权威上下文到 Q1c..."
          },
          {
            "type": "command",
            "command": "bash scripts/hooks/hook-check-memory.sh",
            "statusMessage": "注入历史教训..."
          },
          {
            "type": "command",
            "command": "bash scripts/workflow/hook-block-write.sh"
          },
          {
            "type": "command",
            "command": "bash scripts/hooks/hook-enforce-v25.sh",
            "statusMessage": "验证 v2.5 合规..."
          }
        ]
      }
    ]
  }
}
```

### 8.4 与AGENTS.md铁律的关联

| 铁律 | 上下文注射器的作用 |
|------|------------------|
| 铁律 0-3 (读权威文档原文) | Agent看到Q1c里已有文档原文片段——不再需要"记得去读" |
| 铁律 0-4 (测试规范+接线要求) | 权威文档06的测试层定义自动注入 -> SPEC.md的Test Requirements节不再遗漏 |
| 铁律 0-5 (23项错误自检) | 注射器本身就是防御多项错误(#1, #3, #5, #22)的系统级方案 |
| 铁律 24 (异常处理审计) | 注射器自身的降级策略符合铁律24的完整audit |
| 铁律 47 (契约优先) | 权威定义先进入上下文 -> Agent在写代码前已经有契约定义 |

---

## 9. 脚本设计

### 9.1 脚本清单

| 文件 | 用途 | 类型 |
|------|------|------|
| `scripts/workflow/hook-inject-context.sh` | 主注射器脚本，PreToolUse hook调用 | Bash |
| `scripts/workflow/authoritative-docs-map.json` | 文档ID到文件路径的映射表 | JSON |
| `scripts/workflow/inject-context-parser.py` | 解析权威文档提取结构化字段 | Python |
| `.codex/settings/injections/` | 注射记录持久化目录 | 数据 |

### 9.2 主脚本骨架: hook-inject-context.sh

核心流程（伪代码）：

```bash
#!/bin/bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TODAY=$(date +%Y-%m-%d)
INJECTION_DIR="$ROOT/.codex/settings/injections"
MAP_FILE="$ROOT/scripts/workflow/authoritative-docs-map.json"

# Step 1: 定位 task brief
BRIEF=$(find "$ROOT/.claude/task-briefs/" -name "${TODAY}*" -type f 2>/dev/null | head -1)
[ -z "$BRIEF" ] && { echo "[inject-context] 无今日task brief"; exit 0; }

# Step 2: 检查Q1c是否已存在
grep -q "### c) 上下文注入" "$BRIEF" 2>/dev/null && { echo "[inject-context] Q1c已存在，跳过"; exit 0; }

# Step 3: 提取权威文档引用
DOC_REFS=$(grep -oP '(权威文档\d+|DOC-\d+)' "$BRIEF" 2>/dev/null | sort -u || true)
EDGE_REFS=$(grep -oP 'E-\d+\.\d+' "$BRIEF" 2>/dev/null | head -1 || true)

# 无引用 -> 静默退出
[ -z "$DOC_REFS" ] && [ -z "$EDGE_REFS" ] && { echo "[inject-context] 未引用权威文档"; exit 0; }
# 只有Edge ID -> 隐式添加权威文档01
[ -z "$DOC_REFS" ] && [ -n "$EDGE_REFS" ] && DOC_REFS="权威文档01"

# Step 4: 验证文档ID存在 + Step 5: 提取片段 + Step 6: 写回brief
# (详细实现见实现阶段)
```

### 9.3 解析器: inject-context-parser.py 骨架

```python
#!/usr/bin/env python3
"""上下文注射器 -- 权威文档结构化字段提取器。

Usage:
  python3 inject-context-parser.py --doc-id 权威文档01 --template A --file <path> --version commit abc123
"""
import re, argparse, sys
from pathlib import Path


def parse_template_a(filepath, doc_id, version):
    """模板A: 因果边文档 -- 提取 Edge ID + 参数名 + 正常范围 + 来源路径"""
    text = Path(filepath).read_text(encoding='utf-8', errors='replace')

    param_pattern = re.compile(
        r'^\|\s*([a-z_][a-z_0-9]*)\s*\|\s*[^|]*\|\s*[^|]*\|\s*([^|]+)\|\s*([^|]+)\s*\|',
        re.MULTILINE
    )

    output = f"#### {doc_id}: 因果边定义

"
    output += f"文档版本: {version}

"
    output += "| Edge ID | 参数名 | 正常范围 | 来源路径 |
"
    output += "|---------|--------|---------|----------|
"

    seen = set()
    blocks = re.split(r'^### E-', text, flags=re.MULTILINE)
    for block in blocks[1:]:
        edge_match = re.match(r'([\dX]+\.[\d]+): (\S+)', block)
        if not edge_match:
            continue
        edge_id = f"E-{edge_match.group(1)}"
        for param_name, normal_range, source_path in param_pattern.findall(block):
            key = (edge_id, param_name)
            if key in seen:
                continue
            seen.add(key)
            output += f"| {edge_id} | {param_name} | {normal_range.strip()} | {source_path.strip()} |
"

    # 提取文件路径引用
    path_refs = set(re.findall(r'`([a-zA-Z0-9_/\.\-]+\.(?:ts|py|sh|json|yaml|toml))`', text))
    if path_refs:
        output += "
**关键文件路径引用**:
"
        for fp in sorted(path_refs)[:15]:
            output += f"- {fp}
"

    return output


def parse_template_d(filepath, doc_id, version):
    """模板D: 通用文档 -- 提取标题结构 + 文件路径引用"""
    text = Path(filepath).read_text(encoding='utf-8', errors='replace')
    output = f"#### {doc_id}

"
    output += f"文档版本: {version}

"
    titles = re.findall(r'^#{1,3}\s+(.+)', text, re.MULTILINE)
    if titles:
        output += "**文档结构**:
"
        for t in titles[:20]:
            output += f"- {t}
"
    return output


TEMPLATES = {'A': parse_template_a, 'D': parse_template_d}


def main():
    parser = argparse.ArgumentParser(description='上下文注射器解析器')
    parser.add_argument('--doc-id', required=True)
    parser.add_argument('--template', default='D')
    parser.add_argument('--file', required=True)
    parser.add_argument('--version', default='unknown')
    args = parser.parse_args()
    template_fn = TEMPLATES.get(args.template, parse_template_d)
    print(template_fn(args.file, args.doc_id, args.version))


if __name__ == '__main__':
    main()
```

---

## 10. 存储规范

### 10.1 注射记录位置

```
.codex/settings/injections/{task-id}.json
```

其中 `{task-id}` 为 task brief 文件名去掉 `.md` 后缀。

### 10.2 注射记录格式

```json
{
  "task_id": "2026-07-22-1400-上下文注射器实现",
  "ts": "2026-07-22T06:30:00Z",
  "docs_injected": ["权威文档01", "权威文档06"],
  "versions": {
    "权威文档01": "a1b2c3d4e5",
    "权威文档06": "f6g7h8i9j0"
  },
  "git_commit": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  "warnings": "",
  "status": "injected",
  "brief_file": ".claude/task-briefs/2026-07-22-1400-上下文注射器实现.md"
}
```

### 10.3 失败记录的格式

```json
{
  "task_id": "2026-07-22-1500-不存在的文档ID",
  "ts": "2026-07-22T07:00:00Z",
  "docs_injected": [],
  "error": "MISSING_DOC_IDS",
  "missing": ["权威文档17"],
  "status": "blocked"
}
```

### 10.4 记录的消费者

- **创始人控制塔仪表盘**（后续章节）：展示注射历史和成功率
- **自动审计**：检查注射记录判断哪些任务缺少权威信息
- **版本追踪**：注射记录中的commit hash可用于回溯 bug 出现的版本

---

## 11. 测试与接线

### 11.1 Test Requirements

| 测试层 | 文件 | Fixture类型 | 数量 | 覆盖内容 |
|-------|------|-----------|------|---------|
| L1 | tests/workflow/hook-inject-context.test.sh | mock brief + mock docs | >=5 | 正常注入/无引用静默/文档不存在/版本不一致/重复注入跳过 |
| L1 | tests/workflow/inject-context-parser.test.py | mock .md/.html 文档 | >=4 | 模板A提取/模板B提取/模板C提取/格式降级 |
| L2a | tests/workflow/inject-context.integration.test.sh | 真实brief + 真实文档 | >=2 | 端到端注射流程/版本检查缓存复用 |
| L2c | tests/workflow/authoritative-docs-map.test.sh | 真实文件路径 | >=1 | 所有映射指向的路径真实存在 |

### 11.2 测试关键行为

```
Test 1: 正常注入
  - Given: task brief 引用 "权威文档01"
  - When: hook-inject-context.sh 运行
  - Then: Q1c 包含 "| E-01 | scan_frequency | 1-3 |" 格式的行
  - Then: injection记录写入 .codex/settings/injections/

Test 2: 无引用静默通过
  - Given: task brief 未引用任何权威文档
  - When: hook-inject-context.sh 运行
  - Then: exit 0, injection记录 status=no_references

Test 3: 文档ID不存在
  - Given: task brief 引用 "权威文档99"
  - When: hook-inject-context.sh 运行
  - Then: exit 1, stderr 包含 "FATAL"
  - Then: injection记录 status=blocked

Test 4: 版本不一致
  - Given: 上次注入缓存hash与当前文档git hash不同
  - When: hook-inject-context.sh 运行
  - Then: 注入最新内容, Q1c 包含 "版本刷新" 告警行
  - Then: exit 0（不阻断）

Test 5: 重复注入跳过
  - Given: Q1c 已包含 "### c) 上下文注入"
  - When: hook-inject-context.sh 运行
  - Then: exit 0, 不修改 brief
```

### 11.3 Wiring Verification

| Export/Output | 调用方 | 验证命令 |
|--------------|--------|---------|
| hook-inject-context.sh | .codex/hooks.json PreToolUse hook | grep -rn "hook-inject-context" .codex/hooks.json |
| inject-context-parser.py | hook-inject-context.sh | grep -rn "inject-context-parser" scripts/workflow/hook-inject-context.sh |
| authoritative-docs-map.json | hook-inject-context.sh | grep -rn "authoritative-docs-map" scripts/workflow/hook-inject-context.sh |
| Q1c注入字段 | 开发文档Agent读取 | 开发文档Agent的system prompt中引用 |
| injection记录JSON | 创始人控制塔仪表盘 | 仪表盘读取 .codex/settings/injections/ |

---

## 12. 验收标准

### 12.1 Done标准

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | hook-inject-context.sh 存在于 scripts/workflow/ | test -f scripts/workflow/hook-inject-context.sh |
| 2 | inject-context-parser.py 通过模板A测试 | python3 tests/workflow/inject-context-parser.test.py |
| 3 | authoritative-docs-map.json 覆盖15个权威文档 | python3 -c "import json; assert len(json.load(open(...)))==15" |
| 4 | generate-task-brief.py 模板包含 Q1c 占位符 | grep -q "上下文注入" scripts/workflow/generate-task-brief.py |
| 5 | .codex/hooks.json 包含 hook-inject-context 为 step 0 | grep -q "hook-inject-context" .codex/hooks.json |
| 6 | 正常注入流程端到端通过 | bash tests/workflow/inject-context.integration.test.sh |
| 7 | 注射记录目录存在且可写 | test -d .codex/settings/injections && test -w .codex/settings/injections |
| 8 | AGENTS.md 更新: 标记错误#1/#3/#5/#22 的防御方案 | grep -q "上下文注射器" AGENTS.md |

### 12.2 质量要求

- **性能**: 单次注射执行时间 < 3秒（解析1-3个权威文档）
- **大小**: 单次注入片段 < 5 KB（不显著增加Agent上下文开销）
- **可靠性**: 降级策略覆盖率 100%（所有失败模式都有降级路径）
- **零假阻断**: 正常场景下（有文档引用+文档存在）exit 0 率 = 100%

---

## 附录A: 铁律0-5自检清单

```
[x] 我读了权威文档原文吗？
     -> 是。权威文档01第二章前100行，generate-task-brief.py全文。
[x] 我引用了测试权威规范 #6 吗？
     -> 是。见 section 11.1 Test Requirements。
[x] 我写了接线要求吗？
     -> 是。见 section 11.3 Wiring Verification。
[x] 我验证了所有 edge ID / 文件路径 / 函数名在代码库中真实存在吗？
     -> 是。system-registry.json 的 edges/sentinels/computes 已验证存在。
[x] 我检查了不是凭记忆吗？
     -> 是。所有引用都有 Get-Content 读取记录。
[x] 我验证了新文件有对应测试文件吗？
     -> 是。section 11.1 已规划测试文件清单。
[x] 我用 Set-Content -Encoding UTF8 写 .py 了吗？
     -> N/A（此文档为 .md 文件；实现阶段将遵循）
[x] 我确认了没有用 --no-verify 绕过 pre-commit 吗？
     -> N/A（此文档为研究设计，非代码提交）
```

---

## 附录B: 后续章节预告

- **第二章: Agent生命周期管理器** -- 监控Agent状态、自动重启、会话恢复
- **第三章: 诊断质量追踪器** -- 对比Agent产出与golden标准、自动回归检测
- **第四章: 创始人仪表盘** -- 所有Agent状态、诊断历史、注射覆盖率、错误趋势
- **第五章: 自动纠错循环** -- 当注射器检测到Agent反复犯同类错误时，自动升级为pre-commit硬阻断

---

> 文档结束。下一步：创始人审阅 -> 批准 -> 实现阶段（开发文档Agent）。
