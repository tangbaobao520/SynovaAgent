# GS-01 首诊旅程场景（D446 + D527 扩展）

> 场景: 问卷/诉求入口 → 首诊诊断 → 报告产物可达（≤3 天路径）
> 前置: D232/D233 Electron 一体化 ✅（已在 main: 03f0ef86/cca6f721/8df38ad4）
> 归属: scripts/golden-scenarios/ → DeepSeek Harness（进审计无豁免）

## 断言契约（3 + 5 + 1 条，机器判定）

| # | 断言 | 类型 | 证明 |
|---|------|------|------|
| 1 | 无 JWT 调 consult → 401 | 负向 | 首诊入口鉴权 fail-closed（S0-1） |
| 2 | 带 JWT 缺 teamId → 400 VALIDATION_ERROR | 正常·参数契约 | 首诊入口可达 + 校验正确（S0-2） |
| 3 | GET /api/sentinel/reports → 200 | 正常·产物 | 报告查询端点可达（S0-2） |
| 4-6 | electron 打包/自启契约/双引导（D504） | 静态+无头 | L1-1/L1-4/L1-5（L1-4 契约 2026-08-25 D527 对齐切片 B prod=`process.execPath + dist/backend.mjs`） |
| 7 | 数据目录重定向 SYNOVA_DB_PATH=userData（D504） | 静态 | L1-7（物理实测升级见 scripts/desktop/upgrade-data-verify.sh + runbook） |
| 8 | consult-llm-recorded（D527） | 门控全链 | L1-6（见下） |

## 诚实 RED 声明（2026-08-21；2026-08-25 D527 更新）

- **契约断言（1-7）无 LLM 依赖，恒可跑**；**consult 真实六阶段（断言 8）依赖 LLM key**，
  非确定性产物不进无条件机器断言——采用 **GS01_LLM 门控 + 状态落盘**：
  - `GS01_LLM=1 bash .../run.sh`：带 JWT 发真实 `POST /api/diagnosis/consult`（teamId=gs01-e2e），
    收集 SSE 事件流 → `consult-llm-status.txt` 须为 `CONSULT_LLM_GREEN`（phase_started 0-5 全出现
    + complete + reportId 非空 + `GET /consult/:id/report?format=markdown` 200），
    SSE 原文与计时落 `evidence/GS-01-llm-stream-<date>.txt` / `GS-01-llm-timing-<date>.json`。
  - 未设 `GS01_LLM`：状态文件写 `CONSULT_LLM_RED (LLM key 未提供 ...)`——**如实 RED，不伪造全链路绿**。
  - 断言引擎（common/assert.ts）无条件分支原语，故机器断言只锁"状态被诚实记录"（contains
    `CONSULT_LLM_`）；GREEN/RED 的值由 evidence quote 呈现，由 README 本契约 + K3 复核约束。
- 全链路六阶段完成是端到端目标，与"30 分钟从安装到可发起"计时解耦（计时见
  `scripts/desktop/first-diagnosis-timing.sh`，runbook: docs/synova/runbooks/first-diagnosis-e2e.md）。

## 运行

```bash
bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh            # 8/8 契约断言（LLM 组如实 RED）
GS01_LLM=1 bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh # LLM 环境：全链路 GREEN（SSE ≤15 分钟）
# exit 0 = 8/8 断言通过；证据写 evidence/GS-01-<date>.json
```

## 验收（派单）

- [x] 场景脚本 + expect.json 进 git（evidence 产物本机落盘，.gitignore 约定）
- [x] 机器判定 exit 0/1
- [x] 诚实 RED 标注（契约级 + LLM 门控组，非假绿）
- [x] D527：LLM 门控真实 consult 断言组 + SSE 事件流/计时 evidence 落盘（P2-2）
