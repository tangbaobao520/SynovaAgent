---
状态: implemented
日期: 2026-09-17
决策: DSH 借鉴标准改按三条元断言执行——M3 抄码允许且鼓励 / 桥接引用禁止（禁 import @deepseek-ai/*、禁 re-export 壳）/ 抄写处留「包+文件+符号」锚点注释 + 现验命令；M2 G3 守卫物理化（每卡必须回写 26 线验收点 + 生成绑定该点 id 的证据文件，未回写 = 不计通过）；M1 复用口径（DSH 已有能力重叠的验收点必须写成「接入/配置/约束 DSH 的 <能力> 并验证」，verify 须同时指向 DSH 侧接入点 + 本仓断言）。落点归属按 R1-R6（单一归属 / 按服务的验收点归属 / modules 必须 git pathspec 命中 / 新增目录同 PR 同步 product-lines.yaml / 不整目录挂靠 / 未归属不得开卡）
理由: 旧口径「借鉴止于范式，绝不引入代码依赖」（DOC-0114 红线 1）与创始人 2026-09-17 裁定冲突——抄码从"禁"转"允许且鼓励"，真正要禁的是**桥接引用**（import/re-export 壳），因为桥接会让 tsc 通过但运行时崩溃（engine-core 事故形态）且无法本地演进；同时旧 G3「每卡挂台账行」是软要求，物理上无法判"卡做完了没"——代码进 git 而被计入完成度的通道必须靠「证据 × 验收点」绑定关掉（看板读绑定，不读代码存在性）
---

## 触发场景

创始人 2026-09-17 裁定「抄代码允许且鼓励 / 桥接引用禁止 / 抄完留锚点 + 现验命令」，并指定更新 `docs/synova/research/DSH迁移施工图-20260820/DSH借鉴指引-v2-20260904.md`（原文件处，不新建目录）+ 与 V1 v0.2 元断言的一致性核对表。

## 物理取证（D808 执行期实测，可复现）

1. **卡已落代码但零绑定证据**（"git 有、看板没有"的根因）：B-01(D586)/B-02+B-06(D593)/B-03(D598)/B-04(D587)/B-05(D594)/B-07(D588)/B-09+B-10(D599) 均在 main；`docs/synova/product-lines/evidence/` 全目录 grep「借鉴 / B-0 / D587 / D593 / D598 / D599」→ 仅 README.md 命中；41 个 pass 点不含 21-3 / 20-3。`ledger.json`（2026-09-17 01:26）v1_total=125 / v1_passed=21 / delivery_pct=16.8%；`product-progress.json`（2026-09-16 19:00）线20/21/22 = 0%。
2. **落点零归属 + paths 写错 = A1 失效检查空转**：`src/llm/`（7 文件，含 B-02/03/04/06 落点）、`src/store/`、`src/config/`（B-09/B-10 落点）、`src/services/`（30 文件）**无一被任何线的 modules 包含**；yaml 线20/线21 的 `"providers/"` 实测 `git log -- providers/` 零输出（该目录不存在），真实目录 `src/providers/` 命中 D586/D598。
3. **锚点存量缺口**：`grep -rln "deepseek-harness/packages\|D:/deepseek-harness" src/ --include="*.ts"` = 4 文件（`src/llm/tool-result-pruner.ts` / `src/llm/timeout.ts` / `src/agent/context-compaction.ts` / `src/store/session-projection.ts`）——旧口径的 Win 路径锚点，按 M3 需补"包 + 符号 + 现验命令"（属 src/ 改动 → 另立编码卡）。
4. **锚点失效现场（D797）**：现行安装 `deepseek-harness-pkg 0.1.6-alpha.1`（2026-09-17 02:01）；文档历史版本 5 个全过时；`dsh-subprocess-local` 的 `signalTree()` 已不存在（现行 `signalChildGroup` 等）→ 行号/旧符号一律禁止照抄，只锚 包+文件+符号 并现查。

## 相关 D#

- D808（本卡，治理文档更新：§10 合规口径 / §11 G3 物理化 / §12 落点归属 / 附录 C 一致性核对表）
- D797（锚点三原则 + 现验命令来源，分支 `docs/dsh-reanchor-20260917`）
- D793 / D795（26 线 V1 验收标准 125 断言 + ledger 派生器）
- D774（证据管线 evidence-writer / rerun）；D587/D588/D593/D594/D598/D599（已落卡：B-01…B-07/B-09/B-10）
- 待派（本卡登记不改）：B-01…B-10 回写 + 落点归属落 yaml + 4 文件锚点补齐 + B-20(D769) 未登记

## 参考系（DECISION-REFERENCE 四步）

① 第一性原理：同一句话只允许一处原文，其余处只能是逐字副本 + 核验命令（多份改写必然漂移）
② Anthropic 工程基线：机器可验契约 + 失败即关闭（未回写 = 不计通过，不是"警告"）
③ 开源实证：DSH `dsh-invariants`「检查可选、违约必炸」= 把软约束升级为物理判据的同一思路
④ 收敛检查：三者同向 → 引文块逐字 + 核验命令可跑 + 未回写一律不计通过
