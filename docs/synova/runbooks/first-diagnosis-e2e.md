# Runbook: 首诊旅程端到端实测（D527，验证点 1-6）

> 目标: 企业用户从「双击安装」到「首诊页可发起诊断」≤ 30 分钟（物理计时可复现）；端到端首诊（发起 → SSE 六阶段 → 报告呈现）在 LLM 环境跑通。
> 归属: D527（slice L1-C）。K3 审计员可按本 runbook 独立重跑（1-8 复核）。

## 0. 前置

- 切片 A+B 已合入 main（安装包 build-synova.cjs + 服务自启 backend-spawn.cjs）。
- LLM key 可用环境（`DEEPSEEK_API_KEY` 等 provider 配置）——consult 六阶段依赖 LLM；无 key 时全链路段如实 RED（见 §4）。
- 环境坑: DSH 宿主默认 `ELECTRON_RUN_AS_NODE=1`——跑 Electron/open 实测时显式 `env -u ELECTRON_RUN_AS_NODE`。

## 1. 端到端实测路径（dev，无安装包）

```bash
# ① 起后端（终端 1）
npm run dev
# ② 起 renderer（终端 2；或直接跑桌面端）
cd electron-renderer && npm install && npm run dev
# ③ 浏览器打开 vite 提示的 URL → Composer 输入任意组织问题描述 → 发送
```

观测点（D527 四缺口修复后的期望行为）:
1. **六阶段进度条**: header 下方「阶段 N/6 · 组织访谈/数据采集/假设生成/根因分析/报告生成/交付」逐阶段推进（`phase_started` 0→5，sse-contract 归约）。
2. **报告可见**: complete 后右栏「诊断报告」tab 渲染 onePager（`GET /consult/:id/report?format=markdown`，currentReportId 已落 app-store）；「落地模式」tab 可生成方案。
3. **降级诚实**: LLM 不可用/后端未就绪 → CenterPanel 顶部红色错误条（`⚠ <errorMessage>`），不白屏不静默。
4. **入口**: Composer 命令面板选「/诊断」→ 直接触发诊断（语义化发送）。

## 2. 端到端实测路径（prod，安装包）

```bash
# ① 打安装包（切片 A 契约）
npm run build:backend && (cd electron-renderer && npm run build) && npx electron-builder --config build-synova.cjs --mac
# ② 计时实测（安装 → 启动 → healthz → 可诊断；evidence JSON 自动落盘）
bash scripts/desktop/first-diagnosis-timing.sh --mode prod --installer release/<产物>.dmg
# ③ 打开安装后的 app，走 §1 观测点 1-4
```

## 3. 30 分钟计时（验证点 1-6 的物理证据）

```bash
bash scripts/desktop/first-diagnosis-timing.sh --mode dev  --dry-run   # 契约自检（幂等零副作用，exit 0）
bash scripts/desktop/first-diagnosis-timing.sh --mode prod --dry-run   # 缺 --installer → exit 2
bash scripts/desktop/first-diagnosis-timing.sh --mode prod --installer release/<产物>.dmg
```

- 里程碑: `install_start → install_done → app_launch → healthz_200 → first_diagnosis_ready`（epoch ms）+ `total_sec` + `verdict`。
- 产物: `scripts/golden-scenarios/evidence/first-diagnosis-timing-<date>.json`。
- 30 分钟是**目标值非硬断言**——`verdict=OVER_TARGET` 如实记录（不伪造）。
- 六阶段诊断完成与 30 分钟解耦（LLM 耗时不受控）——全链路完成见 §4。

## 4. GS-01 LLM 门控组（全链路 SSE 六阶段断言）

```bash
bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh             # 契约断言 8/8；LLM 组如实 RED
GS01_LLM=1 bash scripts/golden-scenarios/GS-01-first-diagnosis/run.sh  # LLM 环境：CONSULT_LLM_GREEN
```

- GREEN 条件（物理断言）: SSE 流 `phase_started` phase 0-5 全出现 + `complete` + `reportId` 非空 + `GET /consult/:id/report?format=markdown` 200。
- 产物: `evidence/GS-01-llm-stream-<date>.txt`（SSE 原文）+ `GS-01-llm-timing-<date>.json`（consult 计时）+ `GS-01-<date>.json`（断言 evidence）。
- 无 LLM key → `CONSULT_LLM_RED (LLM key 未提供 ...)`——诚实 RED，禁止伪造绿（README §诚实 RED）。

## 5. 期望产物清单（K3 复核）

| 产物 | 路径 |
|---|---|
| 契约单测 | `npx vitest run tests/electron/use-streaming-contract.test.ts`（12 用例全绿） |
| 回归 | `npx vitest run tests/electron/` 全绿 |
| GS-01 断言 evidence | `scripts/golden-scenarios/evidence/GS-01-<date>.json` |
| LLM SSE 原文/计时 | `evidence/GS-01-llm-stream-<date>.txt` / `GS-01-llm-timing-<date>.json` |
| 30 分钟计时 JSON | `evidence/first-diagnosis-timing-<date>.json` |
| 桌面端实测截图/日志 | `docs/synova/product-lines/evidence/`（LLM 环境补，⏸ 项如实标注） |

## 6. 已知边界（诚实声明）

- 完成报告存**内存有界缓存**（50 条 FIFO，`src/routes/diagnosis.ts` D480 现状）——服务重启后 GET /report 404，RightPanel 报告 tab 显示降级提示「报告不可用（服务重启后内存缓存已清）」。持久化是独立任务。
- `right_column_update` / `root_cause_identified` 事件已不静默丢弃（console.warn 留痕）但未消费——右栏数据更新是后续任务。
