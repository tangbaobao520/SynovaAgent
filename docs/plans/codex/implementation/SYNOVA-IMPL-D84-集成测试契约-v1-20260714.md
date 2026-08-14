# SynovaAgent — D84 集成测试契约check-integration.sh 实施方案 v1.0

> 2026-07-14 | 第14份权威文档（系统集成与实施路线图）第三章
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（铁律 48）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-14 审计确认）

- 现有检查脚本: `scripts/` 下有 ~15个check-*.sh（check-architecture.sh/check-as-any.sh/check-secrets.sh等）
- 集成契约检查: **零存在** — 无任何跨模块契约验证
- 统一注册表: **零存在** — 无 system-registry.json
- 权威文档14第三章完整定义了11项集成契约 + L1/L2/L3三层检查分层 + 防误报机制

---

## 做了什么

### 1. scripts/workflow/check-integration.sh — 集成契约检查脚本（新建）

三层检查分层（权威文档14 §3.3）:

**L1 结构性检查（<1分钟，零假阳性）:**
- 42边ID清单 × 50哨兵manifest的edges字段 → error
- 所有JSON文件格式正确性 → error
- 所有YAML文件格式正确性 → error
- 所有*.cycle.json的edges.*.edgeId在42边清单中存在 → error

**L2 交叉引用检查（<3分钟，极少假阳性）:**
- compute contractId × Skill manifest的dependencies.computes → error
- Playbook steps[].tool × ToolRegistry → error
- Skill dependencies.sentinels × sentinel-registry → warning
- Playbook contextRequirements × 注册表 → warning

**L3 语义检查（手动触发，不纳入自动化）:**
- ME概念 × 42边语义等价 → info
- 专家提示词PLACEHOLDER × Playbook contextRequirements → info

**告警级别处理:**
- error → 输出到stderr + exit code 1
- warning → 输出到stdout + 写入system-health.log
- info → 仅输出到stdout（开发者日志）

**用法:**
```bash
bash scripts/workflow/check-integration.sh              # 完整L1+L2
bash scripts/workflow/check-integration.sh --phase=2    # 指定Phase的集成检查
bash scripts/workflow/check-integration.sh --l3         # L3语义检查(手动)
```

### 2. scripts/workflow/system-registry.json — 统一注册表（新建）

权威来源——所有ID的注册中心:
```json
{
  "edges": ["E-01", "E-02", ..., "E-42"],
  "sentinels": ["cash-runway", "margin-health", ...],
  "computes": ["COMPUTE-BREAK-EVEN-v1", "COMPUTE-DOL-v1", ...],
  "skills": ["diagnose-cashflow-health", ...],
  "playbooks": ["enterprise-full-diagnosis", ...],
  "causalChains": ["cc-capital-03", ...],
  "cycles": []
}
```

**用途:** check-integration.sh的L1检查以此为权威来源做精确ID匹配。

### 3. .github/workflows/ci.yml — 新增integration-check job（修改）

```yaml
integration-check:
  name: Integration Contract Check
  runs-on: ubuntu-latest
  steps:
    - run: bash scripts/workflow/check-integration.sh
```

---

## 不做什么

- 不修改已有check-*.sh脚本
- 不实现自动修复功能（只检查不修复）
- L3语义检查不纳入CI自动化（手动触发）

---

## 架构层

CI基础设施（`scripts/workflow/check-integration.sh` + `.github/workflows/ci.yml`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | system-registry.json | 1h | 扫描+汇总所有ID |
| 2 | check-integration.sh L1 | 2h | 结构性检查 |
| 3 | check-integration.sh L2 | 1.5h | 交叉引用检查 |
| 4 | ci.yml追加job | 0.5h | integration-check |

**总工时: 5h（1天）**

---

## 完成标准

```
[ ] system-registry.json: 含全部edges/sentinels/computes/skills/playbooks/causalChains/cycles ID清单
[ ] check-integration.sh L1: 4项结构性检查，零假阳性
[ ] check-integration.sh L2: 4项交叉引用检查
[ ] check-integration.sh: error→exit 1, warning→stdout+log, info→stdout
[ ] check-integration.sh: 支持 --phase=N 和 --l3 参数
[ ] ci.yml: 新增integration-check job
[ ] 本地验证: bash scripts/workflow/check-integration.sh 可独立运行
[ ] zero as any（bash脚本，不适用）
```

---

## 权威文档引用

- 第14份权威文档: 系统集成与实施路线图 第三章（集成测试契约与防误报机制）
  - §3.1: 11项集成契约矩阵
  - §3.2: 三级告警精确定义（error/warning/info）
  - §3.3: check-integration.sh三层检查分层（L1/L2/L3）
  - §3.1: 新增3项溢出监控契约（子循环edgeId/溢出参数sourceId/CycleLoader依赖）