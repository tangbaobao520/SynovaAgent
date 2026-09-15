# 编码指令 — D747 桌面端线 1 产物重打 + 证据落盘

> 生成: 2026-09-15 | 执行方: **Mac 编码 session（预设 `synova-dsh`）** | 域: **win**（包装产物与 `build-synova.cjs`/`electron/**`；代行期 Mac 执行）
> 依据: `派单-第五批-产品推进-20260915.md` §三 A 组 A2 | `Win域代行规约-20260915.md`
> 为什么最高优先: 线 1 的 8 个验收点里 7 个 `stale`（证据过期）——**一次 build + 一次实测能重新点亮 1-1/1-3/1-4/1-7（1-6 部分）**

## 一、先读
- `docs/synova/product-lines/product-progress.json` 线 1 的 8 个点与 `done_definition`（创始人双击安装包 → 装好 → 服务自启 → 开窗即用）
- `docs/synova/product-lines/evidence/D712-mac-20260913/`（上一轮证据形态：`1-1-artifacts.txt` / `1-4-*` / `1-7-upgrade-assertions.txt`）—— 本轮要产出**同形态的新证据**（D747-mac-20260915/）
- `scripts/product-lines/calc-progress.py:67`（`EVIDENCE_TTL_DAYS = 14`）与 `:33`（证据日期后该线代码有变更即失效）→ **证据必须绑定本次产物哈希与命令输出**
- `task-state/D747.json`

## 二、做什么（一份产物 + 三份证据）
1. **重打产物**：`npx electron-builder --config build-synova.cjs --mac --arm64`（必要时含 win 目标，但 Windows 实机断言挂账）
2. **装包 → 安装 → 开窗**：Mac 本机实测（安装、服务自启、窗口出现）
3. **落三份原始证据**（贴命令 + 原始输出，不许摘要）：
   - `D747-mac-20260915/1-1-artifacts.txt`：产物清单 + 文件名 + 大小 + **md5/sha256** + `Info.plist` 版本 == `package.json` 版本
   - `D747-mac-20260915/1-4-preload-check.txt`：`[preload-check] OK` 原始日志时间戳
   - `D747-mac-20260915/1-4-renderer-api.txt`：渲染层真实 API 请求（curl/日志，证明链路通）
   - `D747-mac-20260915/1-7-upgrade-assertions.txt`：覆盖安装后 `integrity_check=ok` + 关键表行数不变（数据不丢）
4. **写场景证据**（供进度页兑换）：`docs/synova/product-lines/evidence/scenario-2026-09-15*.json`
   （schema 见 `scripts/golden-scenarios/README.md` §6；`record_type=scenario` + `verdicts[{acceptance_point, verdict, quote}]`）
5. `bash scripts/product-lines/refresh-all.sh` → 线 1 的 `stale` 应下降（贴刷新前后对照）

## 三、硬约束
- **不许伪造绿**：任何一步失败 → 证据文件里如实写 `verdict: fail` + 原始报错（`1-5` 双引导下线、`1-2/1-6` Windows 实机部分**不在本卡范围**，别硬凑）
- 改动面尽量为零：本卡**以取证为主**；若必须改代码（如 preload 路径），写集显式声明并说明必要性
- 写集机器生成：`bash scripts/control-tower/declare-write-set.sh --brief <brief> --base origin/main`
- 单域 win、PR ≤12 文件；提交走 `synova-commit`（禁 `--no-verify`）
- `docs/synova/product-lines/**` 属域判定豁免，不构成跨域

## 四、验收（可证伪）
- [ ] 四份证据文件均含**命令 + 原始输出**，且带本次产物哈希
- [ ] `refresh-all.sh` 后线 1 `stale` 数下降，`pending_k3` 上升（贴两次数值）
- [ ] `scenario-2026-09-15*.json` 能被执行 `calc-progress` 读取（`grep` 到 `record_type`）
- [ ] 未触碰 `scripts/audit/**`、未改 `.github/workflows/ci.yml`

**开始吧。**
