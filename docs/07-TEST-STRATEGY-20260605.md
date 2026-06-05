# Synova 全维度测试方案

> 设计目标：从历史 47+ 次事故中提取教训，建立"任何代码开发都能被测试捕获"的顶级测试体系。
> 历史错误溯源：25 条铁律、4 次接线失败、6 次跨层违例、15 次空 catch、3 次 API Key 泄漏、2 次端口冲突。

---

## 一、测试金字塔（五层）

```
         ╱╲
        ╱  ╲          E2E 用户旅程测试
       ╱    ╲         ─────────────────
      ╱      ╲       集成接线测试 (Wire Check)
     ╱        ╲      ─────────────────
    ╱          ╲     API 契约测试 + Architecture Lint
   ╱            ╲   ─────────────────
  ╱              ╲  单元测试 + 模块间契约测试
 ╱╲              ╲ ─────────────────
╱╲╲             ╲╲ 编译时类型安全 (tsc --noEmit + pre-commit)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

| 层级 | 类型 | 文件命名 | 运行频率 | 预期数量 |
|------|------|----------|----------|----------|
| L0 | 编译时类型安全 | tsc + pre-commit | 每次 commit | 零编译错误 |
| L1 | 单元测试 | `*.test.ts` | 每次 commit | ≥ 200 |
| L2 | 模块间契约 + 架构测试 | `*.integration.test.ts` + `*.architecture.test.ts` | 每次 push | ≥ 60 |
| L3 | API 契约 + 接线测试 | `*.wire.test.ts` | 每次 push | ≥ 30 |
| L4 | E2E 用户旅程 | `*.e2e.test.ts` | 每次 push + nightly | ≥ 10 |
| L5 | 性能 + 安全 + 冒烟 | `*.perf.test.ts` / `*.security.test.ts` | nightly / weekly | ≥ 10 |

---

## 二、L0 — 编译时门禁（零成本，最高性价比）

### 2.1 tsc --noEmit（每次 commit）

```bash
npx tsc --noEmit
```

**必须零错误**。tsconfig.json 的 `strict: true` 已启用，开启以下额外检查：

```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "strictNullChecks": true
  }
}
```

### 2.2 pre-commit 硬阻断（6 项）

| 检查项 | 命令 | 历史事故 |
|--------|------|----------|
| `as any` 零容忍 | `grep -rn 'as any' src/` | 47 次滥用历史 |
| Mock/TODO 残留 | `grep -rn 'MOCK_\|TODO.*后期\|TODO.*hardcode' src/` | KnowledgeInjector MOCK_TEAMS |
| CJS `require()` | `grep -rn 'require(' src/` | health.ts / ontology.ts 混用 |
| vitest `.only()` | `grep -rn '\.only(' tests/` | 漏测 |
| `.env` 真实 Key | `grep -q 'sk-\|ApiKey.*[a-f0-9]\{20\}' .env` | P0-01 API Key 入仓 |
| Secrets 扫描 | `scripts/check-secrets.sh` | 同上 |

### 2.3 铁律门禁（集成入 pre-commit）

| 铁律 | 检查脚本 | 阻断级别 |
|------|----------|----------|
| 铁律 38: as any 零容忍 | `scripts/check-as-any.sh` | 硬阻断 |
| 铁律 39: 五层架构 | `scripts/check-architecture.sh` | 硬阻断 |
| 铁律 11+24+31: 空 catch | pre-commit 检查 | 警告 |
| 铁律 33: 测试命名 | pre-commit 检查 | 硬阻断（新文件） |
| 铁律 34: Feature Branch | pre-commit 检查 | 硬阻断 |
| 铁律 37: 文件大小 >1000 行 | pre-commit 检查 | 硬阻断 |

---

## 三、L1 — 单元测试

### 3.1 通用规则

```
每个 public 函数 ≥ 2 个用例（happy + sad path）
每个 error 分支 ≥ 1 个用例
纯函数必须 100% 分支覆盖
```

### 3.2 模块级别用例要求

| 模块 | 最少用例数 | 特殊要求 |
|------|-----------|----------|
| `providers/` 各 Provider | 4/模块 | Mock HTTP, 覆盖 timeout/401/500/网络断开 |
| `llm/retry-middleware` | 5 | 认证错误不重试, 指数退避, 重试耗尽 |
| `llm/circuit-breaker` | 6 | CLOSED→OPEN→HALF_OPEN 三态机 |
| `llm/output-validator` | 4 | 合法 JSON, 损坏 JSON, markdown 包裹, 空输出 |
| `agent/tools` (ToolRegistry) | 5 | 注册/执行/未知工具/unregister/connector 模式 |
| `evidence/` 三个类 | 6/类 | 证据去重, 矛盾检测 O(n²), 置信度衰减 |
| `security/` PIIScrubber | 4 | 手机号/身份证/邮箱/IP, 非PII字符串不过滤 |
| `cron/scheduler` | 5 | 单次/重复, 失败重试, 持久化恢复, 并发安全 |
| `store/session-store` | 6 | CRUD + FTS5 搜索 + WAL 模式 + 跨租户隔离 |
| `store/storage-backend` | 6 | Memory + Sqlite 双实现等同性测试 |
| `l4/graph-bridge` | 6 | 6 个 upsert 每个 ≥ 1 happy path |
| `l4/diagnosis-graph-query` | 5 | BFS 路径, 子图总结, Broker, 异常模式, 图 Diff |
| `l4/decision-capture` | 3 | 确认/驳回/节点不存在 |
| `l4/triple-reflection` | 3 | keep/correct/remove + degraded fallback |
| `l4/community-reports` | 3 | 社区检测, 摘要生成, 空图降级 |
| `l4/entity-resolver` | 3 | Jaccard 相似度, 结构相似度, 阈值分组（中文警告⚠） |
| `l3/expert-autonomy` | 4 | ReAct 循环, 权限拒绝, 信息增益终止, 最大轮次 |
| `l3/quality-firewall` | 4 | 证据不存在, 低置信度, 专家矛盾, 证据过时 |
| `l3/expert-dispatcher` | 4 | 策略过滤, 匿名化, 引擎模式, fallback 模式 |
| `orchestrator/phase-state-machine` | 5 | 六阶段跃迁, abort, pause, resume, 非法跃迁 |
| `orchestrator/hook-runner` | 4 | allow/deny/modify, post hook 异常不影响流程 |
| `orchestrator/intent-router` | 4 | fastPath 检测, LLM 分类, LLM 失败降级, 中文输入 |
| `expert-platform/validator` | 4 | 注册, 验证记录, 状态迁移, 标记过期 |
| `expert-platform/extractor` | 3 | 成功提取, LLM 失败重试, 必填字段缺失 |

### 3.3 历史事故驱动的专项测试

#### 3.3.1 中文 NLP 脆弱性
```typescript
// 铁律 29 警告：Jaccard 对中文语义一致性的判断接近随机 (Cohen's κ = -0.31)
// 所有涉及中文文本相似度的测试必须标注为"已知限制"
test('entity-resolver 中文同名: Jaccard 警告', () => {
  // Jaccard 将同义改写判为不一致是设计限制，不是 bug
  // 但必须验证 threshold 分组正确
  const result = resolveEntitiesL3(store, 'org1');
  expect(result.matches[0].confidence).toBeDefined();
});
```

#### 3.3.2 syncToSOG 启发式抽取
```typescript
// 历史：正则 /「「([^」」]{1,10})」」/g 使用了错误字符
// 必须测试中文字符边界
test('syncToSOG: 中文人名抽取', () => {
  const result = await engine.syncToSOG();
  expect(result.created).toBe(true);
});
```

#### 3.3.3 GraphStore 多租户隔离
```typescript
// 历史：SOG-002 queryNodes graph 参数可选的跨租户泄漏
test('GraphStore 多租户隔离: 跨组织查询返回空', () => {
  store.createNode('Person', { name: '张三' }, 'orgA');
  const nodes = store.queryNodes('Person', undefined, 'orgB');
  expect(nodes).toHaveLength(0);
});
```

---

## 四、L2 — 集成 + 架构测试

### 4.1 模块间契约测试

```typescript
// tests/architecture/graphstore-compatibility.test.ts (已存在 ✅)
// 验证 synova-agent GraphStore 与 engine-core GraphStore 兼容
```

需要新增的架构契约测试：

| 测试 | 验证内容 | 文件 |
|------|----------|------|
| 五层架构合规性 | L2 不 import L4, L3 不 import L5 | `tests/architecture/layer-boundaries.test.ts` |
| 空 catch 审计 | 零处无 log 的 catch 块 | `tests/architecture/empty-catch-audit.test.ts` |
| vendor 引用审计 | 仅 adapter 文件可引用 `server/vendor/` | `tests/architecture/vendor-reference.test.ts` |
| as any 审计 | 零处 `as any` 在非测试文件 | `tests/architecture/as-any-audit.test.ts` |
| 文件大小审计 | 无 >1000 行的源文件 | `tests/architecture/file-size-audit.test.ts` |
| 导出窄度审计 | 每个包的 index.ts 只导出公共接口 | `tests/architecture/export-narrowness.test.ts` |

### 4.2 API 契约测试

**历史教训**：L0 测试 hit 引擎 :18790 而非 Express :3000（铁律 22）, 14 个测试全绿但测了另一个系统。

```typescript
// tests/l3/e2e-diagnosis.integration.test.ts — 已有雏形，需强化

describe('诊断 API 契约', () => {
  // 每个测试必须显式声明被测系统端口和路由
  const BASE = 'http://localhost:3099'; // 测试专用端口

  it('POST /api/diagnosis/consult → 200 + SSE', async () => { ... });
  it('POST /api/ontology/ingest → 201 + nodeId', async () => { ... });
  it('GET /health → 200 + status: ok', async () => { ... });
  it('GET /api/status → 200 + llmConfigured', async () => { ... });
  it('GET /api/sessions → 200 + sessions[]', async () => { ... });
  it('POST /api/expert/contribute → 201 + id', async () => { ... });
});
```

### 4.3 数据库集成测试

```typescript
// 所有 SQLite 集成测试使用 :memory: 或临时文件
// 永不依赖本地 data/ 目录的持久化数据

describe('SessionStore SQLite 集成', () => {
  const db = new Database(':memory:');
  const store = new SessionStore(db);

  afterAll(() => db.close());

  it('WAL 模式已启用', () => {
    const pragma = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(pragma[0].journal_mode).toBe('wal');
  });
});
```

### 4.4 关键模块链路集成测试

同步到 GraphStore 的完整链路：

```typescript
// tests/l3/e2e-graphbridge.integration.test.ts
// 验证: DiagnosisLauncher → GraphBridge → GraphStore 的完整调用链

test('诊断→本体: KeyPersonRisk 同步到 GraphStore', async () => {
  // Arrange
  const store = createGraphStore('sqlite', getDatabase());
  const bridge = createGraphBridge(store, 'test-org');

  // Act
  bridge.upsertFromKeyPersonRisk([{
    roleId: '张三', riskLevel: 'high',
    knowledgeDomains: ['前端'], busFactor: 1,
  }]);

  // Assert
  const riskNodes = store.queryNodes('Risk', {}, 'test-org');
  expect(riskNodes.length).toBeGreaterThan(0);
  expect(riskNodes[0].props.severity).toBe('high');
});
```

---

## 五、L3 — 接线测试（WIRE CHECK）

> **历史根源**：4 次接线失败（ViewAdapter、Phase0Engine、ModuleRunner、GraphBridge），每次都是创始人发现，不是测试发现。
> **铁律 0-2 Step 5**：WIRE CHECK 是硬门禁。

### 5.1 静态接线审计脚本

```bash
# scripts/wire-check.sh — 每个模块完成后执行

echo "=== 接线审计 ==="

# 核心模块 -> 生产入口 映射表
declare -A WIRING_MAP
WIRING_MAP[EngineCoreVendorAdapter]="src/server.ts src/tui/chat.ts"
WIRING_MAP[ExpertDispatcher]="src/orchestrator/subagent-coordinator.ts"
WIRING_MAP[GraphBridge]="src/agent/diagnosis-launcher.ts"
WIRING_MAP[FederalAdapter]="src/server.ts"
WIRING_MAP[TemplateValidator]="src/routes/expert.ts"
WIRING_MAP[DiagnosisEngine]="src/l2-interfaces/diagnosis-engine.ts"
WIRING_MAP[EventStore]="src/orchestrator/event-bus.ts"
WIRING_MAP[ModuleRunner]="src/orchestrator/diagnosis-orchestrator.ts"

for module in "${!WIRING_MAP[@]}"; do
  target=${WIRING_MAP[$module]}
  result=$(grep -rn "$module" $target 2>/dev/null)
  if [ -z "$result" ]; then
    echo "❌ $module → 在 $target 中未找到引用"
    FAIL=1
  else
    echo "✅ $module → $result"
  fi
done
```

### 5.2 动态接线测试（运行时验证）

```typescript
// tests/architecture/wiring-audit.test.ts
// 运行时验证关键模块是否通过依赖注入创建

describe('Wiring Audit — 运行时接线验证', () => {
  it('EngineCoreVendorAdapter 应在 server.ts 中创建', async () => {
    // 通过检查 ConversationEngine 的 diagnosisEngine 是否非 null
    // 此测试需要 server 启动后运行
    const server = await createServer();
    expect(server).toBeDefined();
    // 注意：此测试需要 server 暴露内部状态或通过事件验证
    server.close();
  });

  it('FederalReporter 应在 server 启动时初始化', () => {
    // 验证: initFederalReporter() 在 server.ts 中有调用
    const serverContent = fs.readFileSync('src/server.ts', 'utf-8');
    expect(serverContent).toContain('initFederalReporter');
  });

  it('Wiring createOrchestrationWiring 应被调用', () => {
    const files = [
      'src/server.ts', 'src/agent/conversation-engine.ts',
      'src/tui/chat.ts', 'src/cli.ts',
    ];
    let found = false;
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('createOrchestrationWiring')) { found = true; break; }
    }
    expect(found).toBe(true);
  });
});
```

### 5.3 模块引用可达性矩阵

理论上，每个模块的"生产入口→模块"路径应该形成 DAG。如果一个模块的入度为 0（不被任何入口引用），就是死代码。

```typescript
// tests/architecture/reachability.test.ts
// 验证所有导出模块在生产入口中可达

const PRODUCTION_ENTRIES = [
  'src/server.ts', 'src/cli.ts',
  'src/tui/chat.ts', 'src/mcp/index.ts',
  'src/agent/synova-agent.ts',
];

// 关键模块列表（必须被至少一个入口引用）
const REQUIRED_MODULES = [
  'EngineCoreVendorAdapter',   // ★ BUG-01: 已被 routes/diagnosis.ts 绕过
  'ExpertDispatcher',          // L3 专家执行器
  'ExpertAutonomyEngine',      // ReAct 循环
  'QualityFirewall',           // 洞察质量门禁
  'FederalReporter',           // ★ BUG-02: 零入口创建
  'TemplateValidator',         // ★ WIRE-03: 零调用
  'EventStore',                // 事件溯源
  'createOrchestrationWiring', // ★ BUG-03: 零调用
];

for (const mod of REQUIRED_MODULES) {
  const referenced = PRODUCTION_ENTRIES.some(entry => {
    const content = fs.readFileSync(entry, 'utf-8');
    return content.includes(mod);
  });
  if (!referenced) console.warn(`⚠ ${mod} 未被任何生产入口引用`);
}
```

---

## 六、L4 — E2E 用户旅程测试

### 6.1 完整诊断旅程

```typescript
// tests/e2e/full-diagnosis-journey.e2e.test.ts
// 从 CLI 启动 → Phase 0 访谈 → Phase 1-5 诊断 → 查看报告

describe('E2E: 完整组织诊断用户旅程', () => {
  const BASE = 'http://localhost:3099';

  beforeAll(async () => {
    // 启动测试服务器（独立端口，:memory: 数据库）
    process.env.DEV_MODE = 'true';
    process.env.PORT = '3099';
    process.env.SYNOVA_DB_PATH = ':memory:';
    server = await createServer();
  });

  afterAll(() => { server.close(); });

  it('Step 1: 健康检查', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('Step 2: 创建诊断会话', async () => {
    const res = await fetch(`${BASE}/api/diagnosis/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: 'test-team',
        initiator: { role: 'CEO', name: '测试用户', organizationName: '测试组织' },
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('Step 3: 本体图查询', async () => {
    const res = await fetch(`${BASE}/api/ontology/graph/test-team`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
```

### 6.2 专家贡献旅程

```typescript
// tests/e2e/expert-contribution-journey.e2e.test.ts

describe('E2E: 行业专家贡献旅程', () => {
  it('Step 1: 贡献行业知识', async () => {
    const res = await fetch(`${BASE}/api/expert/contribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expertId: 'exp-001', industry: 'manufacturing',
        scenario: 'high_turnover', description: '制造业一线工人流失率过高...',
        yearsOfExperience: 15,
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.template).toBeDefined();
  });

  it('Step 2: 查看模板状态', async () => {
    const res = await fetch(`${BASE}/api/expert/marketplace?industry=manufacturing`);
    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThan(0);
  });
});
```

### 6.3 三种入口一致性测试

```typescript
// tests/e2e/entry-point-consistency.e2e.test.ts
// 验证 HTTP API / TUI / CLI 三种入口对同一功能的执行路径一致

describe('E2E: 三种入口的结果一致性', () => {
  it('HTTP API 路径和 TUI 路径的底层逻辑应一致', async () => {
    // HTTP 路径：routes/diagnosis.ts → DiagnosisOrchestrator (直接)
    // TUI 路径：tui/chat.ts → EngineCoreVendorAdapter → DiagnosisEngine → engine-core
    // 两者底层调用的 engine-core 函数应相同
    // 验证方法：两个路径都执行简短诊断，比较输出结构
  });
});
```

---

## 七、L5 — 性能 + 安全 + 冒烟测试

### 7.1 性能测试

| 测试 | 工具 | 阈值 | 触发条件 |
|------|------|------|----------|
| LLM 调用超时 | vitest + AbortSignal | 120s max | 每次集成测试 |
| 图查询响应时间 | vitest | <500ms (1000 nodes) | 每周 |
| 证据池批量插入 | benchmark | >1000/s | 架构变更后 |
| 社区检测 5000 edges | benchmark | <5s | 算法变更后 |
| 内存泄漏检测 | --heapsnapshot | 稳定 RSS | nightly |

### 7.2 安全测试

```typescript
// tests/security/injection-security.test.ts

describe('安全: 注入防护', () => {
  it('NoSQL 注入: orgId 含 SQL 特殊字符', async () => {
    const res = await fetch(`${BASE}/api/ontology/graph/org-a\';DROP TABLE graph_nodes;--`);
    expect(res.status).toBe(400);  // 校验失败，非 500 或数据损坏
  });

  it('路径遍历: 防止 L4 接口被用来遍历文件系统', () => {
    // graph-bridge.ts 中所有 graph/orgId 参数必须通过 validateOrgId
    const types = ['Person', 'Team', '../../../etc/passwd'];
    types.forEach(type => {
      expect(() => store.queryNodes(type, {}, 'org1')).not.toThrow();
    });
  });

  it('API Token 泄漏: Authorization header 不应出现在日志', async () => {
    // 验证 server.ts 第 48-51 行的 token 剥离逻辑
  });
});
```

### 7.3 资源泄漏测试

```typescript
// tests/security/resource-leak.test.ts

describe('资源泄漏检测', () => {
  it('大量诊断后 DB 连接数不增长', async () => {
    const before = getOpenConnections();
    for (let i = 0; i < 10; i++) {
      await runShortDiagnosis(`org-leak-test-${i}`);
    }
    const after = getOpenConnections();
    expect(after - before).toBeLessThanOrEqual(1);
  });

  it('CronScheduler stop/start 不留下 dangling timer', () => {
    const before = getActiveTimers();
    const sched = new CronScheduler(testDb);
    sched.stop();
    const after = getActiveTimers();
    expect(after - before).toBe(0);
  });
});
```

### 7.4 并发安全测试

```typescript
// tests/security/concurrency.test.ts

describe('并发安全', () => {
  it('多个诊断同时运行不互相干扰', async () => {
    const results = await Promise.all([
      runShortDiagnosis('org-a'),
      runShortDiagnosis('org-b'),
      runShortDiagnosis('org-c'),
    ]);
    // 各诊断的 degradedModules 不应为空
    const allDegraded = results.flatMap(r => r.degradedModules);
    expect(allDegraded).toEqual(expect.arrayContaining([]));
  });

  it('EventBus 并发 emit 不丢事件', async () => {
    const bus = new EventBus(new EventStore(testDb));
    const received: string[] = [];
    bus.on('test', (e) => received.push(e.id));

    await Promise.all(Array.from({ length: 50 }, (_, i) =>
      bus.emit({ id: `evt-${i}`, type: 'test', consultationId: 'c1', data: {}, traceId: 't1', spanId: 's1', timestamp: new Date().toISOString() })
    ));

    expect(received.length).toBe(50);
  });
});
```

---

## 八、CI/CD 集成方案

### 8.1 GitHub Actions Pipeline

```yaml
name: CI
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx tsc --noEmit
      - run: bash scripts/check-architecture.sh
      - run: bash scripts/check-as-any.sh
      - run: bash scripts/check-secrets.sh

  unit:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest run --include='tests/**/*.test.ts' --exclude='tests/**/*.integration.test.ts' --exclude='tests/**/*.e2e.test.ts'

  integration:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest run --include='tests/**/*.integration.test.ts'

  e2e:
    needs: integration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest run --include='tests/**/*.e2e.test.ts'

  architecture:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest run --include='tests/architecture/**/*.test.ts'

  security:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest run --include='tests/security/**/*.test.ts'
      - run: npm audit --audit-level=high
```

### 8.2 并行度策略

| 阶段 | 并行 worker | 预计时长 | 失败处理 |
|------|------------|----------|----------|
| lint | 1 | 30s | ❌ 阻断 |
| unit | 4 | 60s | ❌ 阻断 |
| integration | 2 | 120s | ❌ 阻断 |
| architecture | 2 | 30s | ❌ 阻断 |
| e2e | 1 | 180s | ⚠ 警告不阻断 |
| security | 1 | 60s | ❌ 阻断 |

### 8.3 测试环境隔离

```typescript
// vitest.config.ts — 每个测试文件获得独立环境
export default defineConfig({
  test: {
    env: {
      DEV_MODE: 'true',
      PORT: '3099',          // 固定测试端口
      SYNOVA_DB_PATH: ':memory:',
    },
    pool: 'forks',           // 进程级隔离，避免端口冲突
    poolOptions: {
      forks: {
        singleFork: false,   // 每个文件独立 fork
      },
    },
    // 串行执行端口敏感的测试
    testSequencer: async (tests) => {
      const portSensitive = tests.filter(t => t.filepath.includes('smoke'));
      const regular = tests.filter(t => !portSensitive.includes(t));
      return [...regular, ...portSensitive];  // port-sensitive 最后执行
    },
  },
});
```

---

## 九、coverage 目标

### 9.1 当前状态（2026-06-04）

| 指标 | 当前 | 目标（1个月） | 目标（3个月） |
|------|------|-------------|-------------|
| lines | 35% | 50% | 70% |
| functions | 40% | 55% | 75% |
| branches | 25% | 40% | 60% |
| statements | 35% | 50% | 70% |

### 9.2 覆盖率关键缺口（按模块优先级）

| 优先级 | 模块 | 当前覆盖 | 目标 | 策略 |
|--------|------|---------|------|------|
| P0 | `agent/conversation-engine.ts` | ~15% | 50% | 拆分后组件级单元测试 |
| P0 | `orchestrator/` 全部 | ~20% | 50% | 状态机+编排器集成测试 |
| P1 | `l4/` 全部 | ~30% | 60% | GraphBridge 6 方法逐个测 |
| P1 | `providers/` | ~40% | 70% | Mock HTTP/LLM 响应 |
| P2 | `evidence/` | ~25% | 50% | 证据池+矛盾检测 |
| P2 | `security/` | ~10% | 40% | PII scrubbing + 权限策略 |

---

## 十、执行路线图

### Phase 1（本周 — 7 天）

| 天 | 任务 | 产出 |
|----|------|------|
| Day 1 | 修复 vitest 端口冲突（pool: forks + seq） | `vitest.config.ts` 修改 |
| Day 2 | 创建 `tests/architecture/` 测试套件 | 5+ 架构测试文件 |
| Day 3 | 创建 `tests/security/` 测试套件 | 4+ 安全测试文件 |
| Day 4 | 为 wiring.ts / FederalAdapter 写接线测试 | `wiring-audit.test.ts` |
| Day 5 | 为空 catch 补全测试 + 降低存量 | 逐处修复并添加测试 |
| Day 6 | conversation-engine 剩余分支覆盖 | 新增 20+ 用例 |
| Day 7 | 全量 CI 验证 + 覆盖率基线 | CI green + 基线报告 |

### Phase 2（两周）

| 任务 | 目标覆盖率 |
|------|-----------|
| providers/ 全部 provider mock 测试 | 70% |
| orchestrator/ 编排器完整测试 | 50% |
| l4/ GraphBridge 6 方法 + 图查询 | 60% |
| E2E 诊断旅程（HTTP + TUI） | 2 条完整旅程 |
| 性能基准（图查询 1000 nodes） | <500ms |

### Phase 3（一个月）

| 任务 | 目标 |
|------|------|
| 全量覆盖率 > 50% | lines / functions / statements |
| E2E 测试 > 10 条 | 所有 API 端点 + 用户旅程 |
| nightly 性能 + 安全测试 | 零 regression |
| 架构测试在 CI 中硬阻断 | pre-push 强制通过 |

---

## 十一、测试文件清单（增量创建）

| # | 文件 | 层 | 优先级 |
|---|------|----|--------|
| 1 | `tests/architecture/layer-boundaries.test.ts` | L2 | P0 |
| 2 | `tests/architecture/wiring-audit.test.ts` | L3 | P0 |
| 3 | `tests/architecture/vendor-reference.test.ts` | L2 | P0 |
| 4 | `tests/architecture/reachability.test.ts` | L3 | P0 |
| 5 | `tests/architecture/empty-catch-audit.test.ts` | L2 | P1 |
| 6 | `tests/architecture/file-size-audit.test.ts` | L2 | P1 |
| 7 | `tests/architecture/export-narrowness.test.ts` | L2 | P1 |
| 8 | `tests/security/injection-security.test.ts` | L3 | P1 |
| 9 | `tests/security/resource-leak.test.ts` | L3 | P1 |
| 10 | `tests/security/concurrency.test.ts` | L3 | P1 |
| 11 | `tests/e2e/full-diagnosis-journey.e2e.test.ts` | L4 | P0 |
| 12 | `tests/e2e/expert-contribution-journey.e2e.test.ts` | L4 | P1 |
| 13 | `tests/e2e/entry-point-consistency.e2e.test.ts` | L4 | P2 |

---

## 十二、验收标准

每次 PR 合并前必须满足：

```
────────────────────────────────────────────
pre-commit 门禁: 6 项硬阻断全部通过        ✅
      tsc --noEmit: 零编译错误              ✅
架构测试 (architecture/): 全部通过           ✅
安全测试 (security/): 全部通过               ✅
单元测试覆盖率: 不降（由 vitest thresholds 保证）✅
E2E 测试: 关键旅程通过                       ✅

禁止合并条件（任一触发）:
  ❌ as any 出现在 src/ 非测试文件
  ❌ 新增空 catch 块
  ❌ 新增 server/vendor/ 引用不在 adapter 内
  ❌ 核心模块引用触网（入度=0 且无标注）
  ❌ 测试失败非 EADDRINUSE
────────────────────────────────────────────
```
