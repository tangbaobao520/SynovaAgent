# @synova/test-kit — 全维度测试套件

> 位置：`packages/test-kit/`  
> 架构审计 + 接线验证 + 安全测试 + E2E 旅程  
> 对应文档：`docs/07-TEST-STRATEGY-20260605.md`

---

## 与策略文档的对应

```
docs/07-TEST-STRATEGY.md  (战略方案)
        │
        ▼
packages/test-kit/         (可执行实现)
├── src/wiring-registry.ts    ← 第三、五章 (接线注册表)
├── src/test-utils.ts         ← 第八章  (测试环境工厂)
├── src/arch-check.ts         ← 第四章  (运行时架构验证)
├── tests/architecture/       ← 第四章  (架构审计)
├── tests/wire/               ← 第五章  (接线测试)
├── tests/security/           ← 第七章  (安全测试)
└── tests/e2e/                ← 第六章  (用户旅程)
```

## 核心数据结构：WIRING_REGISTRY

**为什么是它决定了整个套件的价值？**

在传统测试中，每个模块写单元测试只验证"这个函数对不对"。但我们的历史 4 次接线失败全部是"函数对了但没人调用它"。WIRING_REGISTRY 解决的是这个根本问题：

```typescript
export const WIRING_REGISTRY = [
  {
    moduleName: 'FederalReporter',       // 类名
    expectedEntries: ['src/server.ts'],  // 应出现在哪个入口文件
    status: 'critical',                  // ★ 当前零引用！
  },
  {
    moduleName: 'createOrchestrationWiring',
    expectedEntries: ['src/server.ts'],
    status: 'critical',                  // ★ 当前零引用！
  },
];
```

**新增模块只需加一行**，测试自动验证接线状态。接线失败在 CI 中被阻断，不再靠创始人抽查。

## 运行方式

```bash
# 安装（在 monorepo 根目录）
cd packages/test-kit && npm install

# 运行单类型
npx vitest run tests/architecture/    # 架构审计
npx vitest run tests/wire/            # 接线验证
npx vitest run tests/security/        # 安全测试
npx vitest run tests/e2e/             # E2E 旅程

# 全量
npx vitest run
```

## 与 CI 集成

```yaml
# .github/workflows/test.yml
jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: cd packages/test-kit && npx vitest run tests/architecture/
      # 架构违规 → 阻断 merge

  security:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: cd packages/test-kit && npx vitest run tests/security/
      # as any 📉 空 catch → 警告

  wire:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: cd packages/test-kit && npx vitest run tests/wire/
      # 接线缺失 critical → 阻断 merge

  e2e:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: cd packages/test-kit && npx vitest run tests/e2e/
      # 用户旅程 → 非阻断
```

## 当前接线状态

从 WIRING_REGISTRY 2026-06-05：

| 状态 | 数量 | 示例 |
|------|------|------|
| **critical** 🔴 | 3 | FederalReporter, createOrchestrationWiring, TemplateValidator |
| **wired** ✅ | 11 | EngineCoreVendorAdapter, ExpertDispatcher, EventStore, 等 |
| **known-broken** ⚠️ | 3 | GraphBridge 5/6 方法未用, CorroborationEngine 无 LLM 语义验证, ReportGraphAdapter |
| **optional** ℹ️ | 4 | AgentObserver, ConnectorPipeline, OntologyEventBus 等建设中 |
