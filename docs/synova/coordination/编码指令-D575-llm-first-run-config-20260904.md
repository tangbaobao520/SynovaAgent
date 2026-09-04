# 编码指令 — LLM 配置首启向导（D575）

> 本指令随 dev doc 交付给编码 session（synova-dsh 预设）。**认真阅读任务文档，然后执行任务。**
> 派单: `docs/synova/coordination/派单-D575-llm-first-run-config-20260904.md`（CTO 派单，d5e5310f 已入库）
> 审计: Kimi K3 会盯着你的任务。按创始人 2026-09-04 指示：**本卡文档免审，代码产出后由创始人统一安排 K3 审计**——你的职责是把 evidence 做到 K3 可独立重跑。

---

## 一、任务文档（必读，先读后动，读不完不动手）

| 文档 | 路径 | 作用 |
|---|---|---|
| D575 spec | `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D575-llm-first-run-config-20260904.md` | LLM 配置首启向导——**编码唯一契约**（含三模块 JSDoc 契约 §4.2-4.4、写集 §3.3.1、DS1-DS11 §11） |
| 派单 | `docs/synova/coordination/派单-D575-llm-first-run-config-20260904.md` | 切片定义/DSH 借鉴锚点/禁碰清单/验收 6 条/交付要求 |
| 北星 | `.claude/PRODUCT-BRIEF.md` §二（FDE 直接用户）+ §五（可演示） | 产品方向锚点：打开产品第一步即配置 |
| 借鉴指引 | `docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md` §6 | 五条硬守卫（G1 零依赖/G2 独立 PR+接线审计/G4 grep 物理证明） |
| 同型先例 | `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D556-ga-collab-e2e-20260829.md` | 前端纯逻辑层 + renderToStaticMarkup 桥接 + 写集漂移预登记的同型做法 |
| 集成测试先例 | `tests/sessions-api.test.ts` | createServer + PORT=0 + 真实 fetch 断言模板（铁律 12 不 mock 管线） |

## 二、执行要求（做到你的最高代码水平）

1. **认真阅读** spec 的 §1（Authority）/ §4（Current State + 三模块契约，实测现状）/ §3.3.1（写集）/ §7（测试分层）/ §11（DS1-DS11）——spec 是唯一契约，声称即引用。
2. **任务复杂 → 先 plan mode 再做**：读 spec §3.3.1 写集表（6 修改 + 7 新建）→ 列出你的改动清单（文件级）→ 确认基线（见 §三-1）→ 想清楚再动手。**禁止没想清楚就改代码。**
3. **最高代码水平**：类型安全（`as any`/`as never`/`as unknown as` = 0，铁律 38）、契约优先（spec §4.2-4.4 三段 JSDoc 契约**原文照抄**进实现文件头，铁律 47）、降级诚实（每个 catch 有 log + degraded；凭证文件损坏区分 ENOENT vs JSON.parse 失败，铁律 24/31）、测试非空壳（expect 断言 + 正常/降级/边界三路径，铁律 48，先写测试证 red）。

## 三、D575 专属硬约束（比通用铁律更具体，违反 = 审计 FAIL）

1. **基线核验（防 M7 漂移）**：
   - spec 全部 file:line 锚定 **main @ d5e5310f**。开工前置（铁律 0-3）：`git fetch --all && git pull --ff-only`，从最新 main 切 `feat/d575-llm-first-run-config`。
   - 若 main 已前进（D483-D486 认证闭环等在途任务合入），**重新核验 spec 引用的行号**（src/config.ts L72-84、src/server.ts L330-345、electron-renderer/src/components/WelcomeScreen.tsx 等）——照旧行号写会红（D524 教训）。本卡设计上**不依赖** D483-D486（路由无认证，spec §6 决策 5）。
   - DSH 锚点已抽验 2 处全中（spec 文档头记录），无需重验。
2. **写集精确性**：只改 spec §3.3.1 写集表 13 条文件（6 修改 + 7 新建）；`git diff --name-only` 与实际改动**完全一致**。**synova.json 零改动**（显式不变声明——key 永不进 synova.json，provider/model/baseUrl 存凭证文件）；E2E 后跑 `grep -c "apiKey\|api_key" synova.json` 必须 = 0。
3. **红线（违反 = 事故）**：不碰 `scripts/audit/`（K3 专属）、`scripts/pre-commit-check.sh`、`electron/main.cjs`、`electron/backend-spawn.cjs`（启动链刚验证）、`src/providers/`（只读消费 createProvider/listProviderTypes）、`src/routes/credentials.ts`（只读范式参照）、`src/security/credential-vault.ts`、`src/deploy/bootstrap.ts`、`electron-renderer/package.json`/根 `package.json`/`vitest.config.ts`（零新依赖）；**零 DSH 依赖**——不 `npm install @deepseek-ai/*`，不 copy DSH 代码，只读范式自研（G1，DS1 grep 断言）。
4. **诚实 RED**：DS6-DS9 的 E2E 物理验收需要**真实 DeepSeek key**（创始人配合提供）。拿不到时：集成测试（stub 上游 http server）已覆盖错误码分类逻辑，E2E 相应项如实标注 ⏸ + 理由（README + evidence 双处），**禁止伪造全链路绿、禁止契约断言冒充全链路**。
5. **evidence 落盘规范（K3 独立复核 + 指纹落盘）**：测试输出、E2E 步骤截图、PID 前后记录、`stat` 权限指纹、时间戳全部落盘 `evidence/D575/`；禁只在 task-state 存单一副本。K3 会独立重跑你的 verify 命令（spec §11 每条 DS 附命令）。
6. **环境坑（实测注记）**：
   - 本机 BSD grep 2.6 **无 `-P`**（gatekeeper C2 在本机恒跳过）——你自验路径/符号一律用 `grep -oE` 或 `grep -rn`。
   - root `tsc --noEmit` 不覆盖 electron-renderer（独立 tsconfig）——前端改动验证：`cd electron-renderer && npx tsc --noEmit && npm run build`（dist 产物用于 DS6 冷启动）。
   - 凭证存储路径每次读 `SYNOVA_DATA_DIR`——**测试必须注入 tmp 目录**（`fs.mkdtempSync(os.tmpdir())`），严禁测试写真实 `data/`；0600 断言 `skipIf(process.platform==='win32')`。
   - 前端 UI 测试复用 `electron-renderer/src/test-support/render.ts`（D556 交付物，只读 import，勿改）；root 无 react-dom，桥接从 renderer node_modules 解析。

## 四、做完之后的复核清单（逐项自查，K3 会盯着你，也会做最后的审计）

1. **与 dev doc 一致**：spec DS1-DS11 逐项对照，声称 = 实现 + 验收（S-2），禁 overclaim、禁重编号/跳号/静默缺项（S-10）。
2. **不违反铁律**：接线完整（新 export 有**生产**调用点，测试调用不计 S-3——spec §8 十二条 grep 逐条实测：resolveLlmApiKey≥2 / getStoredLlmRuntime≥1 / setLlmCredential≥1 / onLlmCredentialChanged≥1 / llmConfigRoutes 挂载 / 前端三函数 / llmUnconfigured≥3）、降级诚实（铁律 24/31）、类型安全（铁律 38）、契约优先（铁律 47）、测试非空壳（铁律 48）、架构边界（铁律 39——llm-credential-store 落 src/services/ 有 5+ 先例）。
3. **无 bug**：spec §11 verify 命令逐条跑通 + `npx vitest run` 全量零失败（铁律 36）+ `npx tsc --noEmit` 零新增 + renderer 侧 tsc/build 过 + pre-commit 13 组全过（**禁 --no-verify**）+ 提交走 synova-commit（**禁 git stash**，铁律 0-3）。
4. **接线完整**：spec §8 每条 grep 出真实生产调用点（热重载链：POST → setLlmCredential → onChanged → server.ts 订阅日志；消费链：config.ts resolve → 每请求 loadConfig → diagnosis-upload-v2 L528 createProvider）。
5. **测试到位**：red→green 已证（实现前用例先红）、覆盖正常/降级/边界、expect 断言非空壳；集成测试走真实路由（铁律 12）。
6. **其他你认为需要复核的点**：残留清理（spec 复核修正已定案：`WELCOME_COPY.firstLaunch` 键删除 + WELCOME_COPY 类型收窄为 `Record<Exclude<WelcomeState,'firstLaunch'>,…>`——零 as 通过 TS 控制流收窄）、G1 零 DSH 依赖 grep、synova.json/data/ 双文件纯净性、evidence 可复现性——你判断需要就查。

## 五、K3 审计提示（收尾要求）

- 本卡完成后**不自行提审**：代码 + evidence + task-state 回填齐备后由创始人统一安排 K3（2026-09-04 指示：文档免审、代码产出再审）。你的收尾 = 让 K3 拿到材料就能独立开审。
- 完成后回填 `task-state/D575.json` 的 **impl 段**（commit + by + files[] 13 条 + `"slice": "llm-first-run-config"`），status 由生成器派生 impl_done。
- 交付声明覆盖 DS1-DS11 全部状态（✅/⏸/❌+理由）；E2E 项引用 evidence/D575/ 具体文件名。
- 审计员会**独立重跑** spec §11 的 verify 命令与 evidence 记录步骤——所有脚本幂等、无本机假设（环境坑见 §三-6，跑前重读 spec §4/§11）。
- **spec 文件随编码首个 commit 同批提交**（消解 spec-only 13 条预登记漂移，spec §3.3.1）。

**开始吧。**
