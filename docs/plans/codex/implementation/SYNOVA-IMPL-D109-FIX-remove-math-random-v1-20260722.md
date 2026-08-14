# SynovaAgent -- D109-FIX GA 路由 Math.random() 移除 实施方案 v1.0

> 2026-07-22 | 审计发现：P1 — getEnterpriseDiagnosisReports 使用 Math.random()
> **审计报告：SYNOVA-AUDIT-REPORT-20260722.md — P1 第3项**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/routes/ga-admin.ts` 存在（3.2KB），`getEnterpriseDiagnosisReports` 函数在 Line 55-58
- [x] Get-Content 读取：ga-admin.ts Line 58 — `return { orgId, reportCount: Math.max(0, Math.floor(Math.random() * 10)), lastReportAt: client.createdAt };`
- [x] Select-String 验证：`Math.random` 出现在 ga-admin.ts 中（1 处命中）
- [x] 引用 — Iron Law 0-5 错误 #11（半成品放过）、AGENTS.md 铁律 8（Mock/TODO 不留到交付代码）

---

## 问题根因

`getEnterpriseDiagnosisReports(orgId)` 是对外导出的公共 API 函数。当前实现返回随机数（`Math.floor(Math.random() * 10)`），而非真实数据。这违反了铁律 8（Mock 不留到交付代码）。虽注释有"后续迁移到 GraphStore"，但调用方（GA 面板）会拿到假数据，造成用户可感知的功能缺陷。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 半成品修复。移除 `ga-admin.ts` 中 `getEnterpriseDiagnosisReports` 的 `Math.random()` 调用，替换为返回 0 的明确占位符 + 清晰的 @todo 注释。

### Q1：调研
- ga-admin.ts Line 55-58：`getEnterpriseDiagnosisReports` 是导出的公共 API
- 函数签名要求返回 `{ orgId, reportCount, lastReportAt }`
- 无 GraphStore 集成的条件下，reportCount=0 是唯一诚实的返回值

### Q2：范围
- 最小：1 行替换 — `Math.floor(Math.random() * 10)` → `0` + @todo 注释
- 不做：不添加 GraphStore 查询（后续 D109-Phase2 任务）、不修改 GA 前端 UI

### Q3：验收
- 入口：调用 `getEnterpriseDiagnosisReports('any-org')` → 返回 `{ orgId, reportCount: 0, lastReportAt: ... }`
- 交互：GA 面板加载企业列表 → 显示 reportCount=0（诚实状态）
- 结果：不再返回随机假数据

### Q4：契约与测试
- @input：orgId（企业 ID）
- @output：`{ orgId, reportCount: 0, lastReportAt: client.createdAt | undefined }`
- @degraded：企业不存在 → `{ orgId, reportCount: 0 }`（无 lastReportAt）
- 测试：验证 reportCount 恒为 0（不变异）

---

## 修复内容

### 1. 修改 src/routes/ga-admin.ts — Line 58（1 行替换）

**修复前：**
```typescript
return { orgId, reportCount: Math.max(0, Math.floor(Math.random() * 10)), lastReportAt: client.createdAt };
```

**修复后：**
```typescript
// @todo(D109-Phase2): GraphStore 集成后替换为真实诊断报告计数
return { orgId, reportCount: 0, lastReportAt: client.createdAt };
```

---

## 不做什么

- 不添加 GraphStore 查询逻辑（后续 D109-Phase2）
- 不修改 GA 前端 UI 中的报告展示
- 不修改 `getEnterpriseList` 或 `enterpriseStore`

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `getEnterpriseDiagnosisReports('existing-org')` → `reportCount: 0`（企业存在但无数据）
- `getEnterpriseDiagnosisReports('nonexistent')` → `reportCount: 0`（企业不存在）
- 4 组 fixture：normal(存在企业) / boundary(不存在的企业) / error(空 orgId) / temporal(重复调用结果一致)

### L2a：接线测试
- ga-admin.ts 不再包含 `Math.random` 或 `Math.floor(Math.random`（grep 验证零结果）
- ga-admin.ts 包含 `@todo(D109-Phase2)` 注释（grep 验证存在）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| getEnterpriseDiagnosisReports | ga-admin.ts GET handler | grep "getEnterpriseDiagnosisReports" src/routes/ga-admin.ts |

---

## 完成标准

```
[ ] ga-admin.ts Line 58: Math.random() → 0 + @todo 注释
[ ] getEnterpriseDiagnosisReports 返回 reportCount 恒为 0
[ ] ga-admin.ts 零 Math.random 和 Math.floor 残留
[ ] @todo(D109-Phase2) 注释存在
[ ] 现有测试 ga-enterprise.test.ts 全部通过（零修改）
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] vitest run --changed 零新增失败
[ ] >=4 个测试：reportCount 验证(2) + grep 接线(2)
```

---

## 权威文档引用

- AGENTS.md 铁律 8：Mock/TODO 不留到交付代码
- AGENTS.md Iron Law 0-5 错误 #11：半成品放过
- SYNOVA-AUDIT-REPORT-20260722.md — P1 第3项
- D109 dev doc：[SYNOVA-IMPL-D109-ga-routes-multi-enterprise-v1-20260722.md](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D109-ga-routes-multi-enterprise-v1-20260722.md)
