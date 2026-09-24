# 决策 Note — M9 控制塔门禁三件套（模式哨兵 + 登记 gate + 既有红棘轮）

- 状态: proposed（待 K3 审 + CTO 收件闸后 git mv 到 implemented/）
- 日期: 2026-09-24
- 决策: 控制塔门禁的失效面收敛为「一个检查器 + 两份基线」：`check-gate-integrity.sh` 做模式语法哨兵、CI 登记 gate、既有红对账；既有违规一律以「显式登记（owner+expires）」入场，**新增即拦**，**到期强制清理**（只减不增）。
- 理由: M3（机制建成未接线/未自测）第 N 次复发的三种形态各需一道防线——判据坏（非法 ERE 恒过 31 天）、没接线（检查器零调用面）、没人登记（测试不在 CI 里跑）；把三者压进一个脚本 + 一份基线，避免"每错加一个脚本"的臃肿（K3 anti-bloat 口径：一个新脚本防一类）。

## 触发场景

- K3 批次2 §五 防线缺口 #1/#2/#7 + 派单-K3回执-批次2 待修 #1（M9 三件套）与 #3（CI 既有红显式登记，B2）。
- 实测：`scripts/pre-commit-check.sh:991` 的排除正则含非法 ERE `^+++` → BSD grep rc=2 → `NEW_DIAG` 恒空 → 组 7a 自建立起从未生效（由 D937 修，本卡只登记不修）。
- 实测：main tip `f25e61eb` check-runs 20 条，既有 failure 2 条（`产物新鲜度（generated_at > 3 天必红）`、`Vitest (2/2)`）此前无人登记 → "CI 权威"叙事落空。

## 关键设计决定（可核）

1. **只接 CI，不改 `scripts/pre-commit-check.sh`**（CTO Q-M9-1）——既有 :991 归 D937；避免"上线即堵队列"（D922 日期炸弹同型事故）。
2. **新建脚本，不并入 `check-canary-drift.sh`**（CTO Q-M9-2）——canary 为告警（恒 exit 0），本器为阻断（三态退出码）。
3. **棘轮语义**：`gate-integrity-baseline.txt` 双段——`[R]` 未登记测试 79 条（密封面 sh|py）、`[P]` 既有非法模式 1 条（owner=D937，expires=2026-10-08）；命中即豁免，基线外必红，条目过期/失效 → exit 1 强制清理。
4. **分面口径**：违规面 = `*.test.sh`/`*.test.py`（须显式登记才执行）；`*.test.ts` 由 vitest glob 自动执行 → 只统计 + NOTE，不判违规。
5. **三态 + 降级不静默**：0 通过 / 1 违规 / 2 执行失败或降级（写 degraded-events 日志）；**解析到 0 个模式即 exit 2**（防扫描器自身坏掉仍报绿）。

## 参考系

Anthropic 工程基线（门禁须可自证 + fail-closed 三态）／第一性原理（门禁失效三形态：判据坏、没接线、没人登记）／仓内先例（D328 三态退出码、D708 写集对账、D515/D516 本地软+CI 硬）→ 结论：棘轮登记 + 新增即拦 + 到期强制清理。

## 关联

- 上游：K3 批次2 §五 #1/#2/#7；派单-K3回执-批次2 待修 #1/#3
- 同族：D937（组 7a 修复，本卡仅在 `[P]` 登记其坐标）；B3（D922 夹具登记）；B4（D925 调用面接线）
- 交付证据：`/tmp/m9-verify-20260924-1828.md`（独立自验 V1–V10 + M1–M6 变异体）

## 修订 1（2026-09-24 晚，CTO 裁定 A）：棘轮 STALE 去平台陷阱

**触发**：本卡首版在 CI（GNU grep）红、本地（BSD grep）绿。根因——`scripts/pre-commit-check.sh:991` 的 `^+++` 在 BSD 是非法 ERE（rc=2，视为"仍违规"→ 命中 `[P]` 豁免），在 GNU 是**合法模式**（匹配一切 → 坐标"已不再违规"）→ 触发首版「条目已不再违规 → exit 1」规则 → CI job 恒红。**同一坐标跨方言判定不同**。

**决策**（CTO 四条约束）：
1. 「已不再违规」→ **可见 STALE 警告 + 计数**（`PATTERN-BASELINE: registered <n>；STALE(<n>)`，逐条 `STALE(gnu|bsd) <坐标>`），**不再 exit 1**；
2. **`expires` 仍是硬门**：缺键 → exit 2；过期 → exit 1（registered / STALE 皆然，防"拔牙"）；
3. STALE 标注平台，方言由**行为探针**判定（不用 `grep --version` 文案）；跨方言差异写入脚本头注释；
4. `GITHUB_STEP_SUMMARY` 可写则落 step summary，存在但不可写 → 显式 degraded exit 2。

**理由（第一性原理）**：棘轮防"永久豁免"的属性应由**时间（expires）**承担；"已不再违规"在跨平台下混淆了"方言差异"与"真实修复"，把它判红等于制造门禁自阻断（本卡首版即被它堵在 CI）。

**同时**（CTO 第四条）：`ci-red-baseline.txt` 补齐 **base（分支/PR push）三条既有红**（TypeScript + Lint + Iron Laws / Control Tower Gate Tests ubuntu / windows），与 main-push 两条共 5 条，每条带 `owner=`（暂 UNASSIGNED，待指派）与 `expires=`。

## 修订 2（2026-09-24 夜，CTO 指令）：既有红 owner 指派 + 处置 SLA + CT(windows) 定态

- **owner 指派（清 UNASSIGNED）**：`产物新鲜度（generated_at > 3 天必红）`/`TypeScript + Lint + Iron Laws`/`Control Tower Gate Tests (ubuntu-latest)`/`Control Tower Gate Tests (windows-latest)` → **mac-control-tower**；`Vitest (2/2)` → **mac-coding**。
- **处置 SLA**：每条 `disposition_due=2026-09-27`；三种可能结论（①修好即删条目 ②转卡并写卡号/owner ③续期+理由+新 expires）；到期未出结论由 `--ci-reds` 判红倒逼。
- **CT(windows) 定态**（自取 2026-09-24T21:21:40+08:00，base `94426c5b`）：`conclusion=failure`（completed 12:13:46Z，id 107618889188）→ 按 CTO 规则**保留条目并替换为定态证据**（原 in-progress 措辞清除）；定态快照复跑 `--ci-reds` → `失败检查 3 项；基线命中 3 项` rc=0。
- **平台相关补充事实**（供 D937）：同一坐标 `scripts/pre-commit-check.sh:991` 的 `^+++`，BSD 侧非法 ERE（rc=2，判"仍违规"）、GNU 侧合法（判"不再违规"）→ 组 7a fail-open 属**平台相关**，两平台均已由 `[P]` 豁免覆盖而不再误伤。
