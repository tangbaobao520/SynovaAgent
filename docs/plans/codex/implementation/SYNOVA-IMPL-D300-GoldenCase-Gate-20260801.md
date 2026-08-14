<!--
  SYNOVA-IMPL-D300: 黄金数据集接入 pre-push 门禁
  状态: dev doc | 2026-08-02 | 优先级 P1 (A线 C-G1)
  权威文档: 权威文档09 §5.2 (F1 门禁) + A线产品完整性审计 第三章 C-G1
  依赖: 无 (机制已完整: 10 用例 + checker)
  并行: D286 (packages/), D292 (src/agent+l3) — 零共享文件
-->

# D300: 黄金数据集接入 pre-push 门禁

## 1. 权威文档引用

**来源**: [权威文档09-CI-CD流水线](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档09-部署运维权威规范-20260713\SYNOVA-RESEARCH-第五章-CI-CD流水线-20260713.html) §5.2

> 不用哨兵触发率作为门禁。用 5 个黄金案例的冻结静态快照数据跑完整诊断 → F1-Score 匹配（关键边命中率 + 根因节点匹配率 + 告警级别一致率三者均=100% 时 CI 门禁判定通过）。

**来源**: [A线产品完整性审计 第三章 C-G1](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\A线-产品完整性缺口审计-20260801\第三章-条件C结论有用审计-20260801.md)

> C-G1 黄金数据集未接入门禁 ⚠️ — 机制完整（10 用例+checker），但无 CI/门禁调用方 → 防无声退化失效。

## 2. 代码审计——现状 (2026-08-02 实测)

### 2.1 机制已完整（存在但未接线）

| 资产 | 位置 | 状态 |
|------|------|:---:|
| 黄金用例 fixture | `tests/fixtures/golden-cases/golden-case-01~10.json` | ✅ 10 个 |
| F1 评分器 | `scripts/ci/golden-case-checker.ts` (D51, tsx 运行, 退出码 0/1) | ✅ 存在 |
| 结构质量检查 | `scripts/ci/diagnosis-quality-check.sh` (D100, 7 项检查) | ✅ 存在 |
| checker 单元测试 | `tests/ci/golden-case-checker.test.ts` | ✅ 存在 |

### 2.2 缺口确认（无门禁调用方）

```
grep -rn "golden-case-checker\|diagnosis-quality-check" scripts/pre-commit-check.sh scripts/pre-push-check.sh .github/workflows/
→ 0 匹配 (2026-08-02 实测)
```

**根因**: D51 交付了评分器、D100 交付了质量检查，但从未接入任何门禁/CI——"机制存在但未执行"，防无声退化失效（A线 C-G1 定案）。

**门禁选型**: pre-commit 有 <5s 硬约束（D291 已把组 12 性能问题 Python 化），tsx 跑诊断管线不满足 → **挂 pre-push**（可容忍 10-60s）；另加 CI job 兜底。

### 2.3 执行可行性实测 (2026-08-02)

- checker 仅 import `fs`/`path`（[L12-13](D:\novis-backup-20260526\Novis\synova-agent\scripts\ci\golden-case-checker.ts:12)）— **纯静态计算，无 DB/服务依赖**，tsx 可独立运行 → pre-push 可行
- fixture 路径硬编码: `path.resolve(currentDir,'..','..','tests','fixtures','golden-cases')`（[L205](D:\novis-backup-20260526\Novis\synova-agent\scripts\ci\golden-case-checker.ts:205)）— 破坏态测试须用 备份+篡改+trap 还原 模式
- ci.yml 现有 jobs: quality / test(matrix) / architecture / integration-check / checker-review → 新增 golden-case job 并行
- tsx 在 devDependencies（npm run dev 依赖）✓

## 3. 实现方案

### 3.1 写集

| 文件 | 操作 | 说明 |
|------|:---:|------|
| `scripts/pre-push-check.sh` | 修改 | 追加 Group: golden-case F1 门禁 + diagnosis-quality 结构检查 |
| `.github/workflows/ci.yml` | 修改 | 新增 golden-case job（tsx 运行 checker, 与现有测试 job 并行） |
| `tests/ci/golden-case-gate.test.ts` | 新建 | 门禁接线测试（见 §4） |

**不碰**: golden-case-checker.ts / diagnosis-quality-check.sh 本体（机制已对）、pre-commit-check.sh（性能约束）、src/。

### 3.2 pre-push 接线

在 `scripts/pre-push-check.sh` 追加（放在 secrets 终扫之后，失败即阻断 push）:

```bash
# ── D300: 黄金数据集 F1 门禁 (A线 C-G1) ──
echo "── Golden Case F1 Gate (D300) ──"
if ! npx tsx scripts/ci/golden-case-checker.ts; then
  echo "❌ 黄金案例 F1 门禁失败 — 诊断质量退化解冻, 见上方 diff"
  exit 1
fi
if ! bash scripts/ci/diagnosis-quality-check.sh; then
  echo "❌ 诊断结构质量检查失败"
  exit 1
fi
```

### 3.3 CI job

`.github/workflows/ci.yml` 新增 job（或并入现有 quality job）:

```yaml
  golden-case:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx tsx scripts/ci/golden-case-checker.ts
      - run: bash scripts/ci/diagnosis-quality-check.sh
```

## 4. 测试要求 (测试优先 — 铁律0-2)

**第一步**: 写 `tests/ci/golden-case-gate.test.ts`（接线断言, 迁移前失败 → red）; **第二步**: 接 pre-push + ci.yml（green）; **第三步**: 破坏态验证。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | 2 | 1) 门禁脚本包含 golden-case-checker 调用 2) fixture 目录 10 个用例存在且 JSON 可解析 |
| L2b | shell 回归 | 1 | 正常态: pre-push 组通过; 破坏态: 篡改 1 个 fixture 期望值 → F1 门禁 exit 1 |

**破坏态自动化**: 新建 `tests/ci/golden-case-break-test.sh` — 备份 golden-case-01.json → 篡改 expected 值 → `npx tsx scripts/ci/golden-case-checker.ts` 断言 exit 1 → `trap` 还原 → 断言 exit 0。夹具损坏即测试失败（防误删）。

## 5. 接线要求

| 新调用 | 位置 | 确认方式 |
|--------|------|---------|
| golden-case-checker.ts | pre-push-check.sh + ci.yml | grep golden-case-checker scripts/pre-push-check.sh |
| diagnosis-quality-check.sh | pre-push-check.sh + ci.yml | grep diagnosis-quality-check scripts/pre-push-check.sh |

## 6. 完成标准

1. `grep -n "golden-case-checker" scripts/pre-push-check.sh` → 命中且 exit 1 阻断
2. `grep -n "diagnosis-quality-check" scripts/pre-push-check.sh` → 命中
3. ci.yml 含 golden-case job
4. `npx tsx scripts/ci/golden-case-checker.ts` 手动运行 exit 0
5. 人为篡改 fixture → pre-push 拒绝（还原后恢复）
6. tsc 零新增错误 | vitest 零新增失败 | pre-commit 2b 通过（新测试有断言）
7. DS7: `tests/ci/golden-case-break-test.sh` 可运行且 trap 还原生效（运行两次, 第二次仍 exit 0）
8. DS8 范围检查: `git diff --name-only` 仅含 pre-push-check.sh / ci.yml / 2 个测试文件

## 7. 自检清单

- [x] 实测 grep: pre-commit/pre-push/ci.yml 均无 golden-case 调用 (C-G1 确认)
- [x] 读 golden-case-checker.ts 头部 (D51 F1 门禁语义 + 退出码)
- [x] 读 diagnosis-quality-check.sh 头部 (7 项结构检查)
- [x] 确认 10 个 fixture 存在 (01~10)
- [x] checker 纯静态 (仅 fs/path) — tsx 独立运行可行
- [x] fixture 路径硬编码 — 破坏态测试用备份+篡改+trap 还原
- [x] ci.yml jobs 现状确认 (quality/test/architecture/integration-check/checker-review)
- [x] pre-commit <5s 约束 → 门禁挂 pre-push 而非 pre-commit
- [x] 不是凭记忆
- [x] 不用 --no-verify
