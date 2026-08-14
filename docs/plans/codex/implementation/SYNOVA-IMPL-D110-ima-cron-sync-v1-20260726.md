# SynovaAgent -- D110 ima 知识库定时同步 实施方案 v1.0

> 2026-07-26 | 权威文档 #16 第二章 — ima 知识对接
> **D104 已建 ima-connector.ts。D110 追加 CronScheduler 定时同步。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/connectors/ima.ts` 存在（D104，ImaClient 类含 authenticate/scanDocuments/extractContent 方法），`src/l3/knowledge-agent.ts` 存在（D105，imaDataSource+PKB 提取），`src/cron/scheduler.ts` 存在（D94，schedule 方法）
- [x] Get-Content 读取：ima.ts L94-170 — `ImaClient` 类：`authenticate(token)`→`scanDocuments(filter)`→`extractContent(docId)`→`checkHealth()`。knowledge-agent.ts — `runGear6` 扩展：ima 提取作为管线第一步
- [x] Select-String 验证：D104 已实现 AES-256-GCM API Key 加密（`encryptApiKey`/`decryptApiKey`）。D105 已实现 `imaDataSource()` 方法
- [x] 引用 — 权威文档 #16 第二章 §2.3："定时同步任务：每 6 小时扫描 ima 知识库新增文档→提取结构化知识→写入 PKB"

---

## 问题根因

D104 建了 ImaClient（认证/扫描/提取），D105 建了 Knowledge Agent 的 ima 管线。但同步是手动的——没有任何 CronScheduler 任务自动触发周期性同步。权威文档 #16 明确要求"每 6 小时定时同步"。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 企业多用户 — ima 定时同步。在 CronScheduler 注册 `ima-sync` 任务（每 6 小时 cron），调用 ImaClient 扫描→提取→写入 PKB。降级路径完整。

### Q1：调研
- ImaClient API：`authenticate(apiKey)`→`scanDocuments(filter)`→`extractContent(docId)`→`checkHealth()`
- Knowledge Agent：`imaDataSource()` 作为 `runGear6` 管线第一步
- CronScheduler：`schedule(id, cronExpr, handler)` — D9 同模式
- 企业 ima 绑定：`enterprise.ts` — `POST /api/enterprise/ima/bind`（D103）存储 apiKey

### Q2：范围
- 最小：在 CronScheduler 注册 `ima-sync`（`0 */6 * * *` 每 6 小时）→ 遍历活跃企业→读取 apiKey→ImaClient 扫描→PKB 提取
- 不做：不修改 ImaClient 逻辑、不修改 Knowledge Agent 管线

### Q3：验收
- 入口：CronScheduler 每 6 小时触发 → ImaClient 扫描 ima 知识库 → 提取文档 → PKB 写入
- 交互：新文档同步后→Knowledge Agent 在下次诊断中可引用 ima 来源的知识
- 结果：日志输出同步文档数 + 写入 PKB 条目数

### Q4：契约与测试
- @input：无（CronScheduler 自动触发）
- @output：同步文档数 + PKB 写入条目数
- @degraded：ImaClient 不可用→跳过+log.warn；apiKey 未配置→跳过
- 测试：cron 注册(1) + 手动触发(1) + 降级(1) = 3 tests

---

## 构建内容

### 1. 修改 src/cron/scheduler.ts 或新增 src/cron/ima-sync.ts — 注册 ima 同步任务

```typescript
// D110: ima 知识库定时同步（每 6 小时）
scheduler.schedule('ima-sync', '0 */6 * * *', async () => {
  const enterprises = enterpriseStore.list();  // 获取活跃企业
  for (const org of enterprises) {
    try {
      const client = new ImaClient(org.imaApiKey);
      await client.authenticate();
      const docs = await client.scanDocuments({ since: '24h' });
      for (const doc of docs) {
        const content = await client.extractContent(doc.id);
        await knowledgeAgent.ingestFromIma(doc, content, org.id);
      }
      log.info({ orgId: org.id, docCount: docs.length }, 'ima sync completed');
    } catch (err) {
      log.warn({ err, orgId: org.id }, 'ima sync failed for org — degraded');
    }
  }
});
```

---

## 不做什么

- 不修改 ImaClient 核心逻辑（D104 已完成）
- 不修改 Knowledge Agent（D105 已完成）
- 不实现实时推送（MVP：定时轮询）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- CronScheduler 中注册了 ima-sync 任务（cron: 0 */6 * * *）
- 手动触发→ImaClient.scanDocuments 被调用
- ImaClient 不可用→跳过+degraded
- 3 个测试

---

## 完成标准

```
[ ] ima-sync 在 CronScheduler 注册（cron: 0 */6 * * *）
[ ] 手动触发→扫描 ima→提取→PKB 写入完整链路
[ ] 降级: ImaClient 不可用→跳过+degraded
[ ] 降级: apiKey 未配置→跳过
[ ] tsc --noEmit 零新增错误
[ ] ≥3 个测试
```


## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| ima-sync cron job | CronScheduler schedule() | grep "ima-sync" src/cron/ |
| ImaClient.scanDocuments | ima-sync handler | grep "scanDocuments" src/cron/ |
