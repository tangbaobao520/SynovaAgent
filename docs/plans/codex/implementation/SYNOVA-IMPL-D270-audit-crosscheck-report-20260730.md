<!--
  SYNOVA-IMPL-D270: Audit Cross-Check + Structured Report Enhancement
  状态: dev doc | 2026-07-30
  权威文档: 控制塔 Ch5 — 外部审计器子模块(交叉对比+报告)
  依赖: 无（独立任务）
  并行: D268, D269 — 零共享文件
-->

# D270: Audit Cross-Check + Structured Report Enhancement

## 1. 权威文档引用

**来源**: 控制塔 Ch5 §1.2

> 外部审计器: 不信任Agent，只检查物理事实。在每次提交后运行，扫描变更文件，对照23项已知错误模式，
> 输出P0/P1/P2严重度分级报告，与Agent自我报告交叉对比。

**来源**: 预期状态模型 v3.1

> G10: Audit cross-check + report (2/5 sub-modules) — runner+signal+rules done, cross-check+report missing

## 2. 代码审计——现状

### 2.1 当前 external-auditor.sh 审计

文件: `scripts/control-tower/external-auditor.sh` (约350行)

**已实现:**
- ✅ Runner: --task-id --diff 模式 (扫描变更文件)
- ✅ Signal: emit-signal.py 集成 (P0→red, P1→yellow, else green)
- ✅ Rules: audit-rules.json 10条规则
- ✅ Dispatch: --dispatch 模式 (known-error-patterns.json 4条E1-E4)
- ✅ Basic report: Markdown格式含P0/P1/P2表格 + 概要

**未完成:**
- ❌ Cross-check 覆盖太窄: 仅检查agent task brief是否提到"接线检查"——跨1个维度
- ❌ 无JSON报告输出: 只有Markdown，控制塔View无法消费
- ❌ Cross-check对比维度不完整: 缺少测试存在对比、as any声明对比、catch处理对比

### 2.2 当前交叉对比代码 (L233-242)

```bash
AGENT_SELF_REPORT=$(git show HEAD:".claude/task-briefs/$TASK_ID.md" 2>/dev/null || echo "")
CROSS_CHECK_FAILS=0

if echo "$AGENT_SELF_REPORT" | grep -qi "接线检查\|wiring"; then
  if ! echo "$AGENT_SELF_REPORT" | grep -qi "grep.*确认\|caller\|调用方"; then
    ((CROSS_CHECK_FAILS++))
  fi
fi
```

**问题**: 只检查"agent是否声称做了接线检查"这一个维度。

## 3. 实现方案

### 3.1 写集（2个文件）

| 文件 | 操作 | 说明 |
|------|:---:|------|
| scripts/control-tower/audit-cross-check.py | 新建 125行 | Python 交叉对比 + JSON报告 |
| scripts/control-tower/external-auditor.sh | 修改 +80行 | 替换交叉对比块 + 调用Python生成JSON |

### 3.2 三项增强

#### Enhancement 1: 多维度交叉对比 (1维→4维)

| 维度 | Agent报告检查 | 物理事实检查 | 不一致判定 |
|------|-------------|-------------|-----------|
| wiring | 声称"接线检查"但无"grep/调用方" | add_finding W001计数 | 声称通过但审计有P0→fail |
| testing | 声称"测试通过" | add_finding S001计数 | 声称通过但审计有P1→fail |
| as_any | 声称"as any=0" | add_finding T001计数 | 声称0但审计非0→fail |
| exception | 声称"catch有log" | add_finding E001计数 | 声称有但审计有空catch→fail |

#### Enhancement 2: JSON报告输出

在Markdown报告之外额外输出 `.codex/audit-reports/{taskId}.json`:

```json
{
  "taskId": "D270",
  "generatedAt": "...",
  "summary": {"p0":0,"p1":2,"p2":1,"total":3},
  "crossCheck": {"total":4,"passed":3,"failed":1,"dims":{"wiring":"pass","testing":"fail","as_any":"pass","exception":"pass"}},
  "findings": []
}
```

#### Enhancement 3: JSON信号对接控制塔

emit-signal调用追加 --completion-score 参数，填充cross-check通过率。

### 3.3 实现要点

1. **不破坏现有流程**: 所有追加在现有代码之后，不修改已有逻辑
2. **降级安全**: JSON生成失败→不阻断Markdown报告输出
3. **CRLF安全**: tr -d '\r' 处理Windows行尾
4. **bash -n 语法检查**: 所有修改保持bash语法正确

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | Python assert | 1 | audit-cross-check.py --task-id test运行验证 |
| L2a | 集成: bash外部审计 | 1 | --task-id --diff 运行后JSON文件存在 |

## 5. 接线要求

| 新输出 | 消费方 | 确认方式 |
|--------|--------|---------|
| audit-report.json | generate-dashboard.py (View 4/5) | grep audit-reports in generate-dashboard.py |
| emit-signal --completion-score | .codex/signals/external-auditor.json | signal JSON含 completionScore 字段 |

## 6. 完成标准

1. Cross-check从1维扩展到4维 (wiring/testing/as_any/exception)
2. JSON报告输出 .codex/audit-reports/{taskId}.json
3. emit-signal包含crossCheck数据
4. bash -n 语法通过
5. --dispatch 模式无回归 (独立路径，不影响)
6. CI推送成功 (仅bash/python脚本，不影响tsc)

## 7. 自检清单

- [x] 已读外部审计器全量代码 (350行)
- [x] 已读audit-rules.json (10条规则)
- [x] 不是凭记忆 (实际grep确认cross-check仅1维)
- [x] 已验证文件路径在代码库中存在
- [x] 不用 --no-verify
