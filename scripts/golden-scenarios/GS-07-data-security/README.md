# GS-07 数据安全场景（D448）

> 场景: 敏感数据 → PII 脱敏 + 越权拒绝
> 前置: D338（orgId 契约网关）**未落地**（contract-gateway 零实现）→ 诚实 RED
>       已就绪能力: PIIScrubber（src/security/pii-scrubber.ts）+ RBAC（src/middleware/rbac.ts）
> 归属: scripts/golden-scenarios/ → DeepSeek Harness（进审计无豁免）

## 断言契约（3 条，机器判定）

| # | 断言 | 类型 | 证明 |
|---|------|------|------|
| 1 | scrub(S2) → 姓名→[姓名] | 正常 | PII 脱敏引擎可用（S7-1） |
| 2 | staff 访问 private workspace → 403 | 正常·负向 | RBAC 越权拒绝（S7-1） |
| 3 | scrub(S1) → 姓名原文保留 | 边界 | 脱敏级别语义正确（S7-2） |

## 诚实 RED 声明（2026-08-21）

- **D338 前置未落地**（契约网关/orgId 别名表零实现）——本场景为**契约级 RED 2/3**：
  覆盖已就绪的 PII 脱敏 + RBAC 越权拒绝两个物理契约。
- **缺失段**（明确标注，非假绿）：
  1. orgId 级数据边界（D338 契约网关）：跨 orgId 数据隔离未实现
  2. 脱敏数据的端到端落库验证（脱敏器在数据管线的接入点）
- 两条缺失已回报 CTO，D338 落地后本场景升级为全链路绿。

## 运行

```bash
bash scripts/golden-scenarios/GS-07-data-security/run.sh
# exit 0 = 3/3 断言通过；证据写 evidence/GS-07-<date>.json
```

## 验收（派单）

- [x] 场景脚本 + evidence JSON 进 git
- [x] 机器判定 exit 0/1
- [x] 诚实 RED 标注（契约级，非假绿）
