# SynovaAgent — D88 CycleLoader加载器(Phase 2e) 实施方案 v1.0

> 2026-07-15 | 第15份权威文档（企业循环溢出导航系统）第一章 §4
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

## 当前状态（2026-07-15 审计确认）

- D83: Bootstrap启动序列 ✅ — Phase 2e预留接口
- D79: ContextLoader ✅ — 企业参数合并器
- `cycles/` 目录: **零存在** — 全部新建
- `src/cycles/` 目录: **零存在** — 全部新建
- 对标模式: `src/sentinel/sentinel-loader.ts` — load/cache/register三步骤
- 权威文档§4.3: CycleLoader完整TypeScript接口

---

## 做了什么

### 1. cycles/builtin/ — 出厂内置循环配置（新建 ×4）

4个出厂子循环JSON配置:
- `customer-cycle.json` — 客户循环(获取→留存→LTV)
- `cash-cycle.json` — 现金流循环(营收→成本→再投资)
- `talent-cycle.json` — 人才循环(招聘→培养→留存)
- `product-cycle.json` — 产品循环(研发→交付→迭代)

每个含完整: cycleId/name/description/applicableIndustries/nodes/edges/overflowFormula/dataMaturity/mapping/crossCyclePropagation

### 2. src/cycles/cycle-loader.ts — CycleLoader（新建）

对标 `src/sentinel/sentinel-loader.ts`:
```typescript
loadCycles(): { cycles: CycleConfig[]; degraded: boolean; errors: string[] }
registerLoadedCycles(): { registered: number; errors: string[] }
```

三目录优先级覆盖: `cycles/custom/{enterpriseId}/` > `cycles/industry/{sector}/` > `cycles/builtin/`
- 扫描 *.cycle.json → JSON.parse → 验证overflowFormula → 注册到CycleRegistry
- 单个文件加载失败 → 标记degraded + 不阻断其他文件
- 使用ContextLoader(D79)合并企业循环参数覆盖表

### 3. cycles/industry/ — 行业循环模板（新建 ×2）

- `cycles/industry/retail-ecommerce/store-replication.json` — 门店复制循环
- `cycles/industry/saas-tech/arr-growth.json` — ARR增长循环

### 4. src/cycles/cycle-registry.ts — CycleRegistry单例（新建）

对标 `src/sentinel/registry.ts`:
```typescript
register(cycle) / unregister(id) / get(id) / list() / listByIndustry(sector)
```

---

## 不做什么

- 不修改 SentinelLoader（只对标其模式）
- 不修改 D83 Bootstrap（只接入Phase 2e预留接口）
- 不实现溢出计算（D89）

---

## 架构层

L4（本体层: `src/cycles/cycle-loader.ts` + `cycle-registry.ts`）+ 扩展（`cycles/builtin/` + `cycles/industry/`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | CycleConfig类型定义 | 0.5h | cycle-loader.ts |
| 2 | 4个出厂循环JSON | 1.5h | cycles/builtin/*.cycle.json |
| 3 | CycleLoader | 2h | src/cycles/cycle-loader.ts |
| 4 | CycleRegistry | 1h | src/cycles/cycle-registry.ts |
| 5 | 2个行业模板 | 0.5h | cycles/industry/*.cycle.json |
| 6 | 测试文件 | 1.5h | tests/cycles/cycle-loader.test.ts |

**总工时: 7h（1天）**

---

## 完成标准

```
[ ] 4个出厂循环JSON: customer/cash/talent/product — 完整7字段Schema
[ ] 2个行业模板: store-replication/arr-growth
[ ] cycle-loader.ts: loadCycles — 三目录扫描+优先级覆盖
[ ] cycle-loader.ts: registerLoadedCycles — 注入CycleRegistry
[ ] cycle-loader.ts: 单个文件失败→标记degraded+不阻断其余
[ ] cycle-registry.ts: register/unregister/get/list/listByIndustry
[ ] 消费D79 ContextLoader合并企业循环参数
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=10测试: loader 6(全量/单失败/空目录/优先级覆盖/行业匹配/全失败) + registry 4(注册/列表/注销/过滤)
```

---

## 权威文档引用

- 第15份权威文档: 企业循环溢出导航系统 第一章 §4（循环配置规范与动态加载机制）
  - §4.3: CycleLoader TypeScript接口 — 对标sentinel-loader的load/cache/register模式
  - §4.1: 判定框架 — 三检验：输入独立性/转化独特性/溢出不可约简性
  - §2.3: 循环配置JSON Schema