# SynovaAgent -- D222 方向有效性监测 (Gate 7) 实施方案 v1.0

> 2026-07-25 | 附录 A v2.0 Gate 7 — 方向有效性监测
> **src/ 下零业务代码。创建方向监测模块——42 边参数 + Goal 集合 → direction_status。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`extensions/ontology/edge-types/` 存在（55 JSON 文件，42 边定义），`src/growth/goal-store.ts` 存在，`src/cycles/cross-scale-validator.ts` 存在（D95 溢出验证）
- [x] Get-Content 读取：附录 A Gate 7 — 通过条件：`src/` 下存在方向监测模块（文件名或内容含 direction/orientation/trajectory，且含 42 边参数读取逻辑）。输出 `direction_status` 取值为 valid/risk/invalid。函数签名接受 42 边参数 + Goal 集合 + 子循环溢出状态中 ≥2 个数据源
- [x] Select-String 验证：`rg -l "direction" src/ --type ts` → 零业务代码（全部为 CSS flex-direction 或数据字段名）
- [x] 引用 — Gate 7 当前状态："❌ 未通过——方向监测模块零业务代码，仅权威文档 02 研究层存在"

---

## 问题根因

附录 A Gate 7 要求系统能自主判断企业当前方向是否还成立。当前 `src/` 下零方向监测业务代码。需要新建模块——读取 42 边当前值、对比基线、输出方向有效性判定。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 诊断层 — 方向监测模块。`src/loops/direction-monitor.ts` — 读取 42 边参数 + Goal 完成率 + 溢出状态 → 输出 direction_status（valid/risk/invalid）→ 写入系统日志。按 LoopScheduler 注册周期性检查（每季度一次，匹配 Gate 7 要求）。

### Q1：调研
- 42 边参数来源：`extensions/ontology/edge-types/` JSON 定义 + GraphStore 中边值数据
- Goal 集合来源：`src/growth/goal-store.ts` 提供 Goal 查询
- 溢出状态来源：`src/cycles/cross-scale-validator.ts`（D95）提供快/慢信号交叉验证
- 判定逻辑：3 类≥50% 的边参数偏离基线 → invalid；任一维度≥30% 偏离 → risk；全部<30% → valid
- LoopScheduler 注册：`src/loops/loop-scheduler.ts` 提供 `registerLoop()` 接口

### Q2：范围
- 最小：`src/loops/direction-monitor.ts` — `DirectionMonitor` 类：checkDirection(enterpriseId) → DirectionReport { status, deviations[], warnings[] }
- 不做：不修改 LoopScheduler 注册逻辑（手工调用或后续集成）、不修改 Goal store、不修改边参数存储

### Q3：验收
- 入口：`monitor.checkDirection('default')` → 返回 DirectionReport
- 交互：读取 42 边参数 → 对比基线 → 计算偏离维度数 → 输出 status
- 结果：direction_status 写入系统日志 → 附录 A 脚本可 grep 到 direction 业务逻辑

### Q4：契约与测试
- @input：enterpriseId
- @output：DirectionReport { status: valid|risk|invalid, deviations: [], warnings: [], checkedAt }
- @degraded：边参数不可用 → degraded + status=valid（降级不阻断）
- 测试：全部 valid(1) + 部分 risk(1) + 全部 invalid(1) + 降级(1) = 4 tests

---

## 构建内容

### 1. src/loops/direction-monitor.ts（新建，约 120 行）

```typescript
export interface DirectionReport {
  status: 'valid' | 'risk' | 'invalid';
  deviations: Array<{ edgeId: string; currentValue: number; baseline: number; deviationPercent: number }>;
  warnings: string[];
  checkedAt: string;
}

export class DirectionMonitor {
  async checkDirection(enterpriseId: string): Promise<DirectionReport> {
    // 1. 读取 42 边当前值（从 GraphStore 或 edge-types JSON）
    // 2. 逐边对比基线值（从 edge-types JSON transfer_function 推导预期范围）
    // 3. 统计偏离维度数
    // 4. 3 类≥50% 偏离 → invalid / 任一维度≥30% → risk / 全部<30% → valid
    // 5. 写入 system_health 日志
  }
}
```

**判定规则（基于 42 边 × 3 类：资本/客户/人才）：**
- 每类统计边偏离率（|current - baseline| / baseline > 30%）
- 3 类中有 2+ 类偏离率≥50% → invalid
- 任一维度偏离率≥30% → risk
- 全部<30% → valid

---

## 不做什么

- 不修改 LoopScheduler
- 不修改 Goal store
- 不修改边参数存储格式

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 全部边在基线范围内 → status=valid + deviations=[ ]
- 资本维度 40% 偏离 → status=risk + deviations 含 E-05 等
- 资本+客户双维度 60% 偏离 → status=invalid + warnings 含"方向可能已失效"
- 边参数不可用 → status=valid + degraded
- 4 个测试

---

## 完成标准

```
[ ] src/loops/direction-monitor.ts: DirectionMonitor 类
[ ] 读取 42 边参数（从 edge-types JSON + GraphStore）
[ ] 3 类判定: 资本/客户/人才 偏离率统计
[ ] 输出 direction_status: valid/risk/invalid
[ ] 降级: 边参数不可用 → valid + degraded
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] ≥4 个测试
```
