# SynovaAgent — D51 CI/CD黄金案例F1门禁 实施方案 v1.0

> 2026-07-14 | 第9份权威文档（部署运维）第五章
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

- 现有 CI: `.github/workflows/ci.yml` — 已含 quality(tsc+lint+iron-laws) + test(vitest shard1/2) + architecture + check + audit
- 黄金案例fixture: **零存在** — 需新建
- 因果一致性评分脚本: **零存在** — 需新建
- 权威文档 §5.2 明确要求: "不用哨兵触发率作为门禁。用5个黄金案例的冻结静态快照数据跑完整诊断→F1-Score匹配——关键边命中率+根因节点匹配率+告警级别一致率——三者均=100%时CI门禁判定通过"

---

## 做了什么

### 1. tests/fixtures/golden-cases/ — 5个黄金案例快照（新建）

冻结静态JSON，不做动态更新:
- `golden-case-01-cashflow-crisis.json` — 现金流危机场景，预期根因为 `E-05 CAPITAL_ACQUISITION`
- `golden-case-02-margin-erosion.json` — 利润侵蚀场景，预期根因为 `E-23 OPERATIONAL_EXECUTION`
- `golden-case-03-churn-surge.json` — 客户流失场景，预期根因为 `E-31 CLIENT_RETENTION`
- `golden-case-04-talent-drain.json` — 人才流失场景，预期根因为 `E-07 TALENT_ACQUISITION`
- `golden-case-05-competition-attack.json` — 竞争冲击场景，预期根因为 `E-33 MARKET_COMPETITION`

每个fixture包含: 输入数据快照 + 预期诊断结果（根因边ID + 根因节点类型 + 告警级别）

### 2. scripts/ci/golden-case-checker.ts — F1评分脚本（新建）

```typescript
// 核心函数
function computeF1Score(actual: DiagnosisResult, expected: GoldenCaseExpectation): F1Result
// 三个匹配维度:
// - 关键边命中率: 提取actual报告中的42边ID → 与expected边ID比较 → 完全匹配=1.0
// - 根因节点匹配率: 提取actual报告中的根因节点类型 → 与expected比较 → 完全匹配=1.0
// - 告警级别一致率: actual的sentinelFinding.severity → 与expected比较 → 完全匹配=1.0
// 三者均=1.0时返回 { passed: true }
```

### 3. .github/workflows/ci.yml — 新增L7黄金案例门禁（修改）

在现有7个job后增加第8个job:
```yaml
golden-case:
  name: Golden Case F1 Gate
  needs: test
  runs-on: ubuntu-latest
  steps:
    - run: npx tsx scripts/ci/golden-case-checker.ts
```

**门禁逻辑**: 脚本exit code 0 = 通过（三者均100%）/ exit code 1 + 详细diff输出 = 不通过。

### 4. 黄金案例维护策略（文档）

- 冻结快照不动态更新（确保输入稳定）
- 每次42边大版本号变更时专家重新锁定预期结论
- 新增黄金案例: 在 `tests/fixtures/golden-cases/` 下添加JSON + 在checker中注册

---

## 不做什么

- 不创建Docker多架构构建（§5.3 — D52规模化运维处理）
- 不创建Windows MSI/macOS DMG打包（D52）
- 不修改现有CI job（只追加第8个job）
- 不侵入现有诊断管线

---

## 架构层

CI基础设施（`.github/workflows/` + `scripts/ci/`）+ 测试fixture（`tests/fixtures/`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | 5个黄金案例fixture JSON | 2h | tests/fixtures/golden-cases/*.json |
| 2 | golden-case-checker.ts | 2h | scripts/ci/golden-case-checker.ts |
| 3 | ci.yml追加L7 job | 0.5h | .github/workflows/ci.yml |

**总工时: 4.5h（半天）**

---

## 完成标准

```
[ ] 5个黄金案例fixture全部创建: JSON格式 + 含输入快照+预期输出
[ ] golden-case-checker.ts: 3维度F1计算(边命中率/节点匹配/级别一致)
[ ] golden-case-checker.ts: 三者均=1.0 → exit 0 / 否则 exit 1 + diff输出
[ ] ci.yml: 新增 golden-case job (needs: test)
[ ] 本地验证: npx tsx scripts/ci/golden-case-checker.ts 可独立运行
[ ] 黄金案例fixture路径冻结标记: 文件头注释"DO NOT MODIFY — frozen snapshot"
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
```

---

## 权威文档引用

- 第9份权威文档: 部署运维权威规范 第五章（CI/CD流水线）
  - §5.2: 发布门禁 — 黄金因果案例回归测试 + F1-Score匹配算法
  - §5.2: 黄金案例维护策略 — 冻结静态快照，版本变更时专家重新锁定