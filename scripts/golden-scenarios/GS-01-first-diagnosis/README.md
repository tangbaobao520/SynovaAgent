# GS-01 首诊旅程场景（D446）

> 场景: 问卷/诉求入口 → 首诊诊断 → 报告产物可达（≤3 天路径）
> 前置: D232/D233 Electron 一体化 ✅（已在 main: 03f0ef86/cca6f721/8df38ad4）
> 归属: scripts/golden-scenarios/ → DeepSeek Harness（进审计无豁免）

## 断言契约（3 条，机器判定）

| # | 断言 | 类型 | 证明 |
|---|------|------|------|
| 1 | 无 JWT 调 consult → 401 | 负向 | 首诊入口鉴权 fail-closed（S0-1） |
| 2 | 带 JWT 缺 teamId → 400 VALIDATION_ERROR | 正常·参数契约 | 首诊入口可达 + 校验正确（S0-2） |
| 3 | GET /api/sentinel/reports → 200 | 正常·产物 | 报告查询端点可达（S0-2） |

## 诚实 RED 声明（2026-08-21）

- **本场景为契约级断言，非全链路绿**。consult 真实六阶段诊断依赖 LLM
  （`createSynovaDiagnosisEngine` + provider.chat），非确定性产物不进机器断言。
- 首诊旅程的**入口/鉴权/参数校验/报告端点**四个物理契约已机器验证。
- 全链路"问卷 → 首诊报告"的 LLM 产出段需 LLM key 可用环境跑，列为后续增强（RED 2/3）。

## 运行

```bash
bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh
# exit 0 = 3/3 断言通过；证据写 evidence/GS-01-<date>.json
```

## 验收（派单）

- [x] 场景脚本 + evidence JSON 进 git
- [x] 机器判定 exit 0/1
- [x] 诚实 RED 标注（契约级，非假绿）
