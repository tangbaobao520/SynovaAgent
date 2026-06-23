# Loop Engineering V4.0 — 零AI自律工程 / Zero-AI-Discipline Engineering

> 不是 V3.9 的升级版。是**架构重构**。
> 
> V2.5: 38 项检查 → `--no-verify` 泛滥。
> V3.0: 5 项检查 → "越少越会被执行"。
> V3.5-3.9: 从 5 项膨胀到 8 组 + 3 项新检查。钟摆又回来了。
> 
> V4.0 的解法不是"再加检查"——是**把所有非物理检查从 bash 移除，用结构化证明替代**。

---

## 一、核心洞察

### V3.9 的 13 项检查完整分类

| # | 检查 | 类型 | 准确率 | 绕过难度 |
|---|------|------|--------|---------|
| 1 | as any 零容忍 | bash grep | 95% | 不可绕过 |
| 2 | empty catch | bash grep | 90% | 不可绕过 |
| 3 | secrets | bash grep | 99% | 不可绕过 |
| 4 | 接线审计 | bash grep | 85% | 不可绕过 |
| 5 | 架构边界 | bash grep | 90% | 不可绕过 |
| 6 | 铁律 46/47 | bash grep | 95% | 不可绕过 |
| 7 | task brief 存在 | bash grep | 100% | 不可绕过 |
| 8 | manifest/tags | bash grep | 70% | 可绕过 |
| 9 | Done 可证伪 | bash grep | 30% | 容易绕过 |
| 10 | CI 验收 | bash grep | 40% | 容易绕过 |
| 11 | Q0c 跟踪 | bash grep | 40% | 容易绕过 |
| 12 | hook-check-memory | 信息注入 | 0% | 不需要绕过 |
| 13 | Q1c 历史教训 | 自由填写 | 0% | 不需要绕过 |

**模式**：bash 检查物理事实（1-7）→ 准确率 90%+。bash 检查语义质量（8-11）→ 准确率 30-40%。非阻断机制（12-13）→ 准确率 0%。

### V4.0 的设计原则

```
bash 只做一件事：验证结构化证明文件存在且格式合法。

结构化证明是什么：
  - plan.json ← 人类审批的计划
  - acceptance-ci-results.json ← CI 运行的测试结果
  - task-brief.md 中的 Q0b grep-output 块 ← grep 命令的实际输出
  - memory/match-results.json ← hook-check-memory 的匹配结果
  - plan-actual-diff.txt ← Plan 文件清单 vs git diff 的比对结果

这些文件：
  1. 由 bash 脚本生成（不是 agent 写的）
  2. 格式由 JSON Schema 定义（不是自由文本）
  3. 被 pre-commit 验证格式合法（不是验证"内容好不好"）
  4. agent 不能修改（只能读取）
```

---

## 二、五层执法架构（V4.0）

```
📋 任务启动 (人工)   →  task-start.sh
                         ├─ 生成 task brief 模板
                         ├─ 运行 scope-check.sh (关键词 → memory/ 匹配)
                         └─ 生成 .claude/memory-match.json (结构化匹配结果)

🧠 写前阻断 (自动)    →  hook-block-write.sh (PreToolUse)
                         ├─ task brief 存在 + Q0/Q1/Q2/Q3 非空
                         ├─ Q0b 必须包含 grep-output 代码块 (``` 包裹)
                         ├─ Q1c 必须引用 memory/ 文件名
                         └─ memory-match.json 非空 → Q1c 必须含匹配关键词

✍️ 写后验证 (自动)    →  verify-incremental.sh (PostToolUse)
                         ├─ L1 oxlint → L2 tsc → L3 vitest → L4 接线

🔴 提交阻断 (自动)    →  pre-commit (7 组物理验证)
                         ├─ 组 1: 类型安全 (as any + 硬编码数据)
                         ├─ 组 2: 测试质量 (catch + 测试配对 + 桩测试)
                         ├─ 组 3: Secrets
                         ├─ 组 4: 接线完整性
                         ├─ 组 5: 架构边界 + 桥接文件
                         ├─ 组 6: 结构化证明验证 (见下方)
                         └─ 组 7: 文件驱动完整性

🔵 Plan 闭合 (提交后)  →  check-plan-closure.sh (post-commit)
                         ├─ Plan 文件清单 vs git diff 比对
                         ├─ plan.json follow_up 对应到后续 phase
                         └─ 写入 plan-actual-diff.txt

🚀 推送阻断 (自动)    →  pre-push (secrets 终扫)
```

### 关键变化：组 6 从"Task Brief"改为"结构化证明验证"

| V3.9 组 6 | V4.0 组 6 |
|-----------|-----------|
| Task Brief 6 字段非空检查 | Task Brief 6 字段非空检查 |
| Done 可证伪 (语法) | **Q0b 必须含 grep-output 代码块** |
| Q0c 跟踪 (格式) | **Q1c 必须引用 memory/ 文件名** |
| — | **plan-actual-diff.txt 存在且为绿色** |
| — | **memory-match.json 格式合法** |

---

## 三、核心机制详解

### 机制 1：Q0b grep-output 物理证明

**问题**：V3.8/V3.9 的 Q0b 是自由文本。"grep 了关键词"只是声明，没有证据。

**V4.0 机制**：Q0b 必须包含一个 ` ```grep-output ` 代码块，内容必须是 grep 命令的实际输出。

```markdown
### b) 文件审计

```grep-output
$ grep -rn "SOGNodeType\|SOGEdgeType" src/ --include="*.ts" | grep -v "\.test\." | grep -v node_modules | wc -l
66
$ grep -rn "SOGNodeType\." src/l4/ src/tools/ --include="*.ts" | head -5
src/l4/graph-bridge.ts:94: people.map(p => ({ type: SOGNodeType.PERSON, ... }))
src/l4/graph-bridge.ts:122: const riskNodeId = store.createNode(SOGNodeType.RISK, ...)
...
```
```

**pre-commit 检查**：
```bash
# Q0b 必须包含至少一个 ```grep-output 代码块
if ! grep -q '```grep-output' "$BRIEF"; then
  echo "Q0b 缺少 grep 命令的实际输出 (必须用 \`\`\`grep-output 代码块包裹)"
  exit 1
fi
# grep-output 块非空（至少 2 行）
```

**为什么有效**：grep 输出是物理证据。agent 可以编造，但编造的 grep 输出和实际代码不匹配时，接口审计检查（已有）会发现虚假引用。

---

### 机制 2：Q1c memory 引用物理证明

**问题**：hook-check-memory 注入信息但 agent 无视。Q1c 自由填写。

**V4.0 机制**：
1. scope-check.sh（task-start 时运行）→ grep task brief 关键词 → memory/ 匹配 → 生成 `.claude/memory-match.json`
2. PreToolUse 检查：如果 `memory-match.json` 有匹配 → Q1c 必须包含至少 1 个匹配到的 memory 文件名
3. 不引用已知教训 → 不准写代码

```json
// .claude/memory-match.json (由 scope-check.sh 生成)
{
  "matches": [
    {"file": "memory/engine-core-split-fraud.md", "keywords": ["engine-core", "桥接"], "score": 3},
    {"file": "memory/file-first-paradigm.md", "keywords": ["文件驱动"], "score": 1}
  ]
}
```

```bash
# PreToolUse hook 检查
if [ -f ".claude/memory-match.json" ]; then
  MATCH_COUNT=$(python3 -c "import json; print(len(json.load(open('.claude/memory-match.json'))['matches']))")
  if [ "$MATCH_COUNT" -gt 0 ]; then
    # Q1c 必须包含至少一个匹配的 memory 文件名
    Q1C=$(awk '/^## Q1/,/^## Q2/' "$BRIEF" | grep -oP 'memory/[a-z0-9_-]+\.md' || true)
    if [ -z "$Q1C" ]; then
      echo "⛔ Q1c 未引用任何 memory/ 文件。scope-check 匹配到 ${MATCH_COUNT} 条相关教训。"
      exit 1
    fi
  fi
fi
```

**为什么有效**：不是"建议"引用——是不引用就不准写代码。agent 仍然可以敷衍（写 `memory/xxx.md` 但不读内容），但至少**物理上无法声称"我不知道有这个教训"**。

---

### 机制 3：Plan-Actual 闭合验证

**问题**：21 个 commit，声称完成，但 Plan 的承诺从未被验证。

**V4.0 机制**：post-commit hook 运行 `check-plan-closure.sh`：
1. 提取 plan.json 当前 phase 及之前所有 phase 的 `files` 字段 → 得到 Plan 文件清单
2. `git diff --name-only plan-start..HEAD` → 得到 Actual 文件清单
3. Diff 生成 `plan-actual-diff.txt`
4. 下一次 pre-commit 组 6 检查 `plan-actual-diff.txt` 存在且 Plan 文件清单全部在 Actual 中出现

```bash
# plan-actual-diff.txt 格式
Plan: 12 files | Actual: 10 files | Match: 9 files
MISSING: extensions/sentinels/profit-health/aggregate.ts (in Plan, not in Actual)
EXTRA: src/sentinel/sentinel-runner.ts (in Actual, not in Plan)
```

**pre-commit 检查**：如果 `plan-actual-diff.txt` 中有 MISSING 行 → 硬阻断。

**为什么有效**：Plan 和 Actual 的差距由 git 物理证明。不是 agent 说"我完成了"——是 git 说"这些文件在 Plan 里但不在你的 commit 里"。

---

### 机制 4：能力验收测试内容验证

**问题**：`check-acceptance-ci.sh` 检查 CI 结果文件存在且 0 失败。但不知道测试内容是否和 Plan 承诺相关。

**V4.0 机制**：
1. CI pipeline 运行 `npx vitest run tests/acceptance/ --reporter=json` → 同时输出测试名称列表
2. CI 结果文件格式包含 `testNames: string[]`
3. pre-commit 组 7（文件驱动完整性）检查：Plan 验收场景关键词在 CI 测试名称列表中至少出现 1 次

```json
// .claude/acceptance-ci-results.json (V4.0 格式)
{
  "numTotalTests": 5,
  "numPassedTests": 5,
  "numFailedTests": 0,
  "testNames": [
    "零代码接入验收 > 创建新行业 pizza-chain 后 queryByTags 返回新类型",
    "零代码接入验收 > git diff 确认零 .ts 文件修改",
    "零代码接入验收 > 专家能加载 pizza-chain 诊断规则"
  ],
  "ciRunAt": "2026-06-24T10:00:00Z",
  "gitCommit": "abc123"
}
```

**pre-commit 检查**：
```bash
# 组 7: Plan 验收关键词必须在 CI 测试名称中出现
PLAN_KEYWORDS=$(grep -oP '验收.*:.*' "$BRIEF" | grep -oP '[一-鿿]{2,}' | head -5)
for kw in $PLAN_KEYWORDS; do
  if ! grep -q "$kw" .claude/acceptance-ci-results.json; then
    echo "Plan 验收关键词 '$kw' 未在 CI 测试名称中出现"
    exit 1
  fi
done
```

**为什么有效**：agent 可以写 `expect(dirs).toContain('sentinels')`，但测试名称必须包含 Plan 的关键词。两者不匹配 → 阻断。

---

### 机制 5：踩坑录知识库恢复 + 强制引用

**问题**：原始踩坑录丢失。新错误不沉淀。铁律注释是唯一载体。

**V4.0 机制**：
1. 从铁律注释反向恢复踩坑录原始条目（每个铁律 → 一个 `memory/` 文件）
2. 新错误写入 `memory/` 的流程标准化：task brief → Q0c audit → lessons learned → `memory/` 条目
3. `memory/MEMORY.md` 索引自动更新（脚本扫描 memory/ 目录）
4. CLAUDE.md 每条铁律注释加 `来源: memory/xxx.md` 引用

---

## 四、V4.0 vs V3.9 对比

| 维度 | V3.9 | V4.0 |
|------|------|------|
| 检查总数 | 13 | 10（7 组 + 3 证明验证） |
| bash grep 物理检查 | 7 | 7（不变） |
| bash 语义检查 | 4（不可靠） | 0（全部删除） |
| 信息注入 | 2（无效） | 0（转为硬阻断） |
| 结构化证明验证 | 0 | 3（Q0b grep-output + Q1c memory-ref + plan-actual-diff） |
| Plan-Actual 闭合 | 无 | post-commit → pre-commit 链路 |
| 踩坑录知识库 | 丢失 | 恢复 + 强制引用 |
| AI 自律依赖 | 5 项 | **0 项** |

---

## 五、实施计划

### Phase 1：踩坑录恢复（1-2 天）

| 操作 | 内容 |
|------|------|
| 从铁律注释恢复 | 47 条铁律 → 47 个 `memory/` 条目（每个条目：铁律编号 + 历史事故 + Why + How to apply） |
| 新错误写入 | Batch 1-4 的 7 个错误 → 7 个 `memory/` 条目 |
| 索引更新 | `memory/MEMORY.md` 索引文件自动生成 |

### Phase 2：结构化证明脚本（1-2 天）

| 操作 | 内容 |
|------|------|
| scope-check.sh 升级 | 加 memory/ 匹配 → 生成 `memory-match.json` |
| Q0b grep-output 检查 | 在 hook-block-write.sh 中加 Q0b 代码块验证 |
| Q1c memory 引用检查 | 在 hook-block-write.sh 中加强制引用检查 |
| plan-actual-diff | check-plan-closure.sh 新脚本 |

### Phase 3：pre-commit 重构（1 天）

| 操作 | 内容 |
|------|------|
| 组 6 重新定义 | "Task Brief" → "结构化证明验证"（Q0b grep-output + Q1c memory-ref + plan-actual-diff） |
| 删除软检查 | 删除 check-verifiable-done.sh（被 grep-output 替代）、check-q0c-tracking.sh（被 plan-actual-diff 替代） |
| CI 验收升级 | acceptance-ci-results.json 加 testNames 字段 + Plan 关键词交叉验证 |

### Phase 4：CLAUDE.md 同步（0.5 天）

| 操作 | 内容 |
|------|------|
| 铁律注释 | 每条加 `来源: memory/xxx.md` 引用 |
| Loop Engineering 版本 | V3.9 → V4.0 |
| 设计哲学 | 加 "零 AI 自律 — 全部物理强制" |

---

## 六、验证标准

V4.0 是否成功的唯一标准：

> 下一个 Batch（任何任务），agent 在没有人类额外干预的情况下，能否在第一次 commit 就通过全部门禁，且 commit 的内容与 Plan 承诺一致？

如果答案是"能"——V4.0 成功。如果答案是"不能"——继续迭代。

---

> 本文档基于以下研究：
> - CLAUDE.md 47 条铁律 + 全部历史注释
> - memory/ 7 个文件（file-first-paradigm, loop-engineering-v2.5, loop-engineering-v3.0, project-state-2026-06-16, project-state-2026-06-17, session-2026-06-16, session-2026-06-17）
> - scripts/ 21 个检查脚本
> - .claude/plan.json + .claude/plan-schema.json
> - Batch 1-5 实际执行的 21 个 commit
> - Q0c 反向审计的 15 个发现
> - docs/lessons/synova-history-and-v3.9-limitations.md
