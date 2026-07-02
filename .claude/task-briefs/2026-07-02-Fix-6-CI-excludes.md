# Task Brief: Fix 6 remaining CI exclude items with mock/stub alternatives

> 生成: 2026-07-02 | 分支: feat/prompt-architecture | 目标：清空 CI exclude

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？无关。修测试，不改架构。

6 项 CI exclude 全部有 mock 替代方案，不需要真实基础设施。

### b) 文件审计

| 排除项 | 根因 | 替代方案 |
|--------|------|---------|
| `tests/e2e/**` (3) | 需要真实 LLM API | Mock HTTP provider 返回固定 JSON |
| `tests/l3/e2e-*.test.ts` (2) | 需要完整 app stack | Mock LLM + 注册 expert |
| `tests/smoke.test.ts` | 图数据请求间不持久 | 修测试数据准备方式 |
| `tests/data-pipeline.*.integration` (2) | 需要飞书 API | Mock HTTP 请求 |
| `tests/circular-dependency.test.ts` | Ubuntu Node 24 模块解析差异 | 修测试兼容两种环境 |
| `tests/acceptance/**` | 仅"零 .ts 修改"本地失败 | 已通过 CI，不需修 |

### c) 决策
不造真实基础设施。用 mock/stub/fake 替代。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
先易后难：① circular-dependency（最易）→ ② smoke → ③ L3 e2e → ④ e2e → ⑤ data-pipeline

### b) 执行约束
- rule: "mock 不携带真实 API key"
  verify: "grep -r 'sk-[a-zA-Z0-9]\|api_key\|DEEPSEEK' tests/ --include='*.ts' | grep -v LLM_API_KEY || echo 'none'"

## Q2: 范围

**做什么**：
1. circular-dependency：适配 Node 24 的模块解析
2. smoke.test.ts：修复 ontology API 数据持久化
3. L3 e2e 测试：加 mock LLM + expert 注册（如已修的三处）
4. E2E 测试：替换真实 LLM provider 为 mock
5. Data-pipeline 测试：mock Feishu HTTP 接口
6. 从 CI exclude 移除已修项

**不做什么**：
- 不改真实 provider 代码（mock 只限测试文件）
- 不改 CI yml
- 不改已通过的测试

## Q3: 验收

入口：`npx vitest run tests/{category} --maxWorkers=1`
结果：每个修复后单独通过
终验：推 CI 全绿

## Done 标准
- [ ] verify: npx vitest run tests/circular-dependency.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: npx vitest run tests/smoke.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: npx vitest run tests/l3/e2e-autonomy.integration.test.ts tests/l3/e2e-graphbridge.integration.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: npx vitest run tests/e2e/diagnosis-pipeline.e2e.test.ts --maxWorkers=1 2>&1 | grep -q 'Tests.*passed'
- [ ] verify: CI run shows all green
