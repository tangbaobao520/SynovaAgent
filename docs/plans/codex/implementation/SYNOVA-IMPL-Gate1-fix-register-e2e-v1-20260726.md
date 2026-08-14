# SynovaAgent -- Gate 1 fix 企业注册端点响应对齐 实施方案 v1.0

> 2026-07-26 | Gate 1 PARTIAL→PASS — checker 的 E2E curl 与端点实际响应格式不一致
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/routes/enterprise.ts` 存在（D103），附录 A v2.0 存在
- [x] Get-Content 读取：enterprise.ts POST `/api/enterprise/register` — 响应为 `{ ok: true, enterpriseId: orgId, adminToken, userId }`。字段名 `enterpriseId` 正确。附录 A Gate 1 通过条件 4 — "端到端测试通过：注册端点返回 HTTP 200 + 有效 JSON"
- [x] Select-String 验证：check-gates-v2.py Gate 1 检查 — C1 文件存在✅ / C2 bcrypt.hash✅ / C3 JWT 返回✅ / C4 端到端 curl → 响应异常❌
- [x] 引用 — Gate 1 当前状态："partial — 端到端: 注册端点响应异常"

---

## 问题根因

Gate 1 的 C1-C3（静态文件检查）全部通过。C4（端到端 curl）失败——checker 尝试 curl register 端点但响应格式或状态码不匹配预期。端点本身正确（返回 200 + enterpriseId），但 checker 的 curl 逻辑可能发送了格式不符的请求体，或期望的响应字段与端点实际返回不一致。需要对齐 checker 的期望与实际端点行为。

---

## 修复内容

### 修改 check-gates-v2.py — Gate 1 C4 端到端逻辑

读取 enterprise.ts register 端点的实际请求格式和响应格式，更新 checker 的 curl 调用使其匹配。具体需要验证：
1. 请求体字段名：`email/password/orgName`（checker 需用这些字段发送 curl）
2. 响应字段名：`enterpriseId/adminToken/userId`（checker 需用这些字段验证）
3. Content-Type：`application/json`
4. HTTP method：POST

如端点本身行为正确但 checker 无法匹配——调整 checker。如端点行为与附录 A 不一致——调整端点。

---

## 不做什么

- 不修改 enterprise.ts 的业务逻辑
- 不修改 bcrypt 或 JWT 流程

---

## 测试要求

### L1：单元契约测试
- checker Gate 1 C4 curl → 端点返回 200 + `{ ok: true, enterpriseId, adminToken }`
- checker Gate 1 判定 PASS（C1-C4 全部通过）
- 2 个测试

---

## 完成标准

```
[ ] check-gates-v2.py Gate 1 C4 端到端 curl 与端点实际格式对齐
[ ] curl register 端点返回 HTTP 200 + enterpriseId + adminToken
[ ] Gate 1 重新运行后显示 PASS
[ ] ≥2 个测试
```
