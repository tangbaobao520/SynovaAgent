## Q0: 定位
D51 = CI/CD Golden Case F1 Gate。CI层(.github/workflows/ci.yml) + 测试fixtures + 脚本。
已有: 5个fixture JSON ✅, checker脚本 ✅, CI job ✅。
缺口: 测试文件缺失, checker函数未导出。
### 文件审计
grep "golden-case" → ci.yml已有job, scripts/ci/有checker, tests/fixtures/有5个JSON
grep "computeF1Score" → 脚本中函数未导出（无法测试）
### 决策
导出computeF1Score/deriveActual → 写测试11个 → 更新CI node版本

## Q1: 调研
标准测试模式: vitest + describe/it/expect。checker脚本已有F1逻辑成熟。

## Q2: 范围
- 导出checker的computeF1Score/deriveActual/GoldenCase类型
- 新增tests/ci/golden-case-checker.test.ts (11测试)
- ci.yml golden-case job node版本 20→22
不做什么: 不修改fixture JSON, 不修改CI其他7个job

## Q3: 验收
入口: vitest run tests/ci/golden-case-checker.test.ts
处理: computeF1Score 4测试 + deriveActual 2测试 + 金数据校验 5测试
结果: 11/11通过, npx tsx脚本独立运行也正常

## 架构层:
CI Layer + Test Fixtures + Scripts
