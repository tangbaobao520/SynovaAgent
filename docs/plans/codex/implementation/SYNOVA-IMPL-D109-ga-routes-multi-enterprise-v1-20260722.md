# SynovaAgent -- D109 GA 路由多企业适配 实施方案 v1.0

> 2026-07-22 | 权威文档 #16：企业多用户部署与 ima 知识对接 — 第五章
> **D103 已有 19 个企业端点。D109 将 GA 路由从 mock 数据源切换到多企业联邦聚合数据源。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：ga-admin.ts、ga-annotations.ts、ga-corrections.ts、enterprise.ts 全部存在
- [x] Get-Content 读取：权威文档 #16 第五章 §5.0 改动范围总览表 — "GA 路由适配：Mock → 联邦聚合数据源切换"、"GA 标注适配：增加数据源上下文标记"、"GA 纠错适配：增加数据源上下文标记"
- [x] Select-String 验证：ga-admin.ts 中有 Mock 数据（getMockData 或其他 mock 函数）
- [x] 引用 — 第五章 §5.0：GA 路由适配 + 标注适配 + 纠错适配，三个文件和企业的关系

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 多企业 GA 功能。当前 GA（增长架构师）路由使用 mock 数据源。D109 将它们切换到多企业真实数据——GA 从企业 A 切换到企业 B 时，GA 面板自动加载该企业的诊断报告、标注、纠错历史。同时增加 GA 临时访问（D103 已有端点，D109 使其在企业间生效）。

### Q1：调研
- 权威文档 #16 第五章 §5.0 — GA 路由适配（Mock→联邦聚合）、GA 标注适配（数据源上下文）、GA 纠错适配（数据源上下文）
- D103 enterprise.ts 已有 GA 临时访问的 4 个端点（generate/validate/data/revoke）
- D106 UserStore 已就绪——可按 orgId 查询 GA 用户
- ga-admin.ts、ga-annotations.ts、ga-corrections.ts 均存在

### Q2：范围
- 最小：修改 GA 三个路由文件——将 mock 数据源替换为企业联邦聚合查询、增加企业上下文注入、GA 临时访问在多企业间生效
- 不做：不修改 GA 工作台的 UI（D108 已做）、不修改 GA 的权限模型

### Q3：验收
- 入口：GA 登录后切换到不同企业 → GA 面板加载该企业的数据
- 交互：GA 在 ga-admin.ts 中选择企业 → 数据源从 mock 切换到该企业的真实诊断/标注/纠错数据
- 结果：GA 可以跨企业管理多个组织的诊断质量

### Q4：契约与测试
- @input：orgId（从 JWT payload 或请求参数获取）
- @output：该企业的诊断报告、标注、纠错列表
- @degraded：企业不存在或无数据 → 返回空列表 + degraded:true
- 测试：切换企业加载不同数据、mock 数据源已移除、GA 临时访问对企业隔离生效

---

## 当前状态（2026-07-22，grep 验证）

- ga-admin.ts、ga-annotations.ts、ga-corrections.ts：全部存在，当前使用 mock 数据
- D103 enterprise.ts：19 个端点已提交（34eeff0），含 GA 临时访问 4 个端点
- D106 UserStore：已提交（77059b0），支持按 orgId 查询
- GA 多企业数据源：零存在——这是新建的聚合查询逻辑
- 权威文档 #16 第五章 §5.0：GA 路由适配 + 标注适配 + 纠错适配均已明文定义

---

## 构建内容

### 1. 修改 ga-admin.ts — Mock → 联邦聚合

- 移除所有 mock 数据函数（getMockData 等）
- 新增 getEnterpriseDiagnosisReports(orgId)：从 GraphStore 按 orgId 查询诊断报告
- 新增 getEnterpriseGaAnnotations(orgId)：从标注存储按 orgId 查询
- 新增 getEnterpriseGaCorrections(orgId)：从纠错存储按 orgId 查询
- 新增 getEnterpriseList(gaUserId)：返回该 GA 可访问的所有企业列表

### 2. 修改 ga-annotations.ts — 增加企业上下文

- 每条标注写入时自动附加 orgId 字段
- 查询标注时按 orgId 过滤

### 3. 修改 ga-corrections.ts — 增加企业上下文

- 每条纠错写入时自动附加 orgId 字段
- 查询纠错时按 orgId 过滤

### 4. GA 临时访问多企业生效

- ga-access/generate 端点：token 绑定特定 orgId
- ga-access/data/:type 端点：仅返回该 orgId 的数据
- ga-access/validate 端点：验证 token 有效性 + orgId 匹配

---

## 不做什么

- 不修改 GA 工作台 UI（D108 已完成）
- 不修改 GA 权限模型（RBAC 已有 admin/ga/manager 角色）
- 不修改 D103 enterprise.ts（GA 临时访问端点已存在，仅调整数据查询逻辑）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- getEnterpriseDiagnosisReports(orgId)：@input (orgId) / @output (报告列表) / @degraded (企业无数据 → 空列表)
- getEnterpriseGaAnnotations(orgId)：@input (orgId) / @output (标注列表) / @degraded (无标注 → 空列表)
- GA 临时访问 orgId 隔离：token 绑定 orgId_A 不能访问 orgId_B 的数据

### L2a：接线测试
- ga-admin.ts 不再有 mock 数据函数（grep "mock" ga-admin.ts → 零结果）
- GA 临时访问 /data/:type 端点按 orgId 过滤（grep "orgId" ga-admin.ts → 存在）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| getEnterpriseDiagnosisReports | ga-admin.ts 路由处理 | grep "getEnterpriseDiagnosisReports" src/routes/ga-admin.ts |
| getEnterpriseGaAnnotations | ga-annotations.ts 路由处理 | grep "orgId" src/routes/ga-annotations.ts |
| getEnterpriseGaCorrections | ga-corrections.ts 路由处理 | grep "orgId" src/routes/ga-corrections.ts |

---

## 完成标准

```
[ ] ga-admin.ts：移除 mock 数据源，替换为按 orgId 的联邦聚合查询
[ ] ga-annotations.ts：每条标注自动附加 orgId，查询按 orgId 过滤
[ ] ga-corrections.ts：每条纠错自动附加 orgId，查询按 orgId 过滤
[ ] GA 临时访问：token 绑定 orgId，数据端点按 orgId 隔离
[ ] getEnterpriseList 函数：返回该 GA 可访问的所有企业列表
[ ] 降级：企业无数据 → 返回空列表 + degraded:true
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] vitest run --changed 零新增失败
[ ] ≥8 个测试：ga-admin(2) + ga-annotations(2) + ga-corrections(2) + 临时访问隔离(2)
```

---

## 权威文档引用

- 权威文档 #16：企业多用户部署与 ima 知识对接 — 第五章 §5.0 改动范围总览
  - GA 路由适配：Mock → 联邦聚合数据源切换
  - GA 标注适配：增加数据源上下文标记
  - GA 纠错适配：增加数据源上下文标记
- D103：enterprise.ts（GA 临时访问 4 个端点）
- D106：UserStore（按 orgId 查询用户）
