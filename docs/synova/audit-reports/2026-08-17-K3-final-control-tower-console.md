# K3 独立终审报告 — 控制塔升级（U1-U8）+ 创始人零信任控制台（13 分支）

> **审计员**: Kimi K3（独立工作区 `/Users/wane/Synova-k3独立审计`，与施工方零共享上下文）
> **日期**: 2026-08-17 | **基线**: `origin/main = 458313f`（物理核对一致）
> **审计对象**: 13 个待合并分支（委托书称 14 个，物理核实审计目标为 13 个：线① 10 + 线② 3；另有 3 个 docs/* 参考分支非审计目标）
> **协议**: AUDIT-PROTOCOL.md（L1-L4 四层）+ K3-AUDIT-STANDARD-v1-20260815.md
> **方法**: 全部结论基于物理证据（git log/diff、脚本实测、故障注入红绿演练、合并模拟）。施工方自报仅作线索，不作依据。

---

## 〇、一句话结论（给创始人）

**12 个分支可以放心合并；`feat/u8-pre-audit-summary` 打回修复（两个死引用，工具交付即死），修好再合。**
合并 `feat/u5a-marker-tristate` 等于知情接受一个权衡：**合法提交后 5 分钟内的 `--no-verify` 绕过将完全不可见**（本报告 §三-7 物理实证）。其余发现均为 P1/P2，不阻断合并。

---

## 一、总结论表

| # | 分支 | 结论 | 核心理由（证据见 §三） |
|---|---|---|---|
| 1 | feat/u3-artifact-reproducibility | **PASS** | 声称=证据；phantom 演练红绿成立；范围缩小已在 brief 显式声明 |
| 2 | feat/u7-ct-test-gate | **CP** | 门禁真拦（演练 1/2）；但 git 不可用时 fail-open（自身契约违例，P1-3） |
| 3 | feat/u1-bypass-reconcile | **CP** | U1a/U1c②真实交付；fail-open 只修一半，合并清单过度声称（P1-4） |
| 4 | feat/u2-writeset-reconcile | **CP** | 反向对账真拦（演练 8）；三处 fail-open 残留（P1-5） |
| 5 | feat/u5-secrets-failopen | **CP** | 预检 exit 2 演练成立；子目录 .env 暂存阻断缺口仍在（P1-6） |
| 6 | feat/u6-sop-gate | **CP** | 物理卡点+persona 接线闭环；契约头声称的注入缝不存在（P1-7） |
| 7 | feat/u5a-marker-tristate | **CP** | 并发/amend 误报根治为真；但真绕过 ≤300s 窗口静默（P1-2，需创始人知情接受） |
| 8 | feat/u5c-verify-parallel-tristate | **PASS** | 三态直传+调用方分流，测试 15/15 复现绿 |
| 9 | feat/u4-claims-table | **CP** | 格式版无活注入面（演练 4）；v2 白名单含 python3/node/sed/awk 必须收紧（P1-8） |
| 10 | feat/u8-pre-audit-summary | **FAIL** | U1 引用不存在的脚本 + U4 无参调用 → 合并后实测永远无法 exit 0（P1-1，演练 5） |
| 11 | feat/founder-truth-mvp | **PASS** | 三态+离线隔离，测试复现绿（经 console-panels 合并） |
| 12 | feat/console-panels | **CP** | 三问面板真实可用；生成快照入库 + 测试污染工作区（P2） |
| 13 | audit/product-lines-verification | **PASS** | 纯文档只读评审，CT-34 豁免正确 |

**机器可读判定（供 task-state 写回）**:
```json
{
  "D412": {"verdict": "PASS", "report": "docs/synova/audit-reports/2026-08-17-K3-final-control-tower-console.md"},
  "D413": {"verdict": "CP", "condition": "ct-test-gate.sh:28 git-fail fail-open 修复"},
  "D414": {"verdict": "CP", "condition": "U1b/U1c①③/U1d 补做或降级 spec；merge-checklist 措辞修正"},
  "D415": {"verdict": "CP", "condition": "G12c 三态化 + 无写集表 exit 1 + heredoc git-fail 处理"},
  "D416": {"verdict": "CP", "condition": "sop-gate 契约头注入缝声明删除或实现"},
  "D417": {"verdict": "CP", "condition": "子目录 .env 暂存阻断补做（check-secrets.sh:110）"},
  "D419": {"verdict": "PASS"},
  "D421": {"verdict": "CP", "condition": "创始人知情接受 ≤300s 绕过窗口；补负向断言"},
  "D422": {"verdict": "PASS"},
  "D423": {"verdict": "CP", "condition": "v2 预跑版落地前白名单移除 python3/node/sed/awk"},
  "D424": {"verdict": "CP", "condition": "founder-console.html 快照移出 git 或 gitignore"},
  "D426": {"verdict": "FAIL", "blocker": "pre-audit-summary.sh:45 U1 死引用 + :48 U4 无参调用"}
}
```

---

## 二、红线节（违反 = 事故；零发现也明写）

| 红线 | 结果 | 物理证据 |
|---|---|---|
| 施工方碰 `scripts/audit/` | **零发现 ✅** | 13 分支 `git diff origin/main...origin/<branch> --name-only -- scripts/audit/` 全部为空（逐分支执行，13/13 = 0） |
| 施工窗口 `--no-verify` 绕过 | **零新增 ✅** | 13 分支 `.claude/bypass.log` 各含 5 条 detected-bypass，全部继承自 main 基线（2026-07-26~28 历史），2026-08-16/17 施工窗口零新增 |
| 施工方自我审计 / 编写审计判定口径 | **零发现 ✅** | U8 仅只读聚合门禁退出码 + 展示 risk 字段，无审计裁决逻辑（`pre-audit-summary.sh` 全文核读）；`audit/product-lines-verification` 为 K3 前序 session 产物（报告内声明"只读复核不改任何代码"） |
| U8 风险分级表替 K3 裁决 | **零发现 ✅** | `pre-audit-summary.sh:107-112` risk→建议文案为展示性质，脚本头 :13-14 明确声明"不编写/修改审计判定口径" |
| ⚠️ 观察项（非红线但需记录） | **施工 commit 身份全部是 `kimi-k3-audit`** | 18 个施工 commit author/committer 均为 `kimi-k3-audit <k3-audit@synova.local>`（git log 物理证据）。实为施工机 git config 所致（施工方 DSH 在 K3 工作区身份的机器上施工），不构成自我审计，但**问责链混淆**——建议施工机 git identity 与 K3 身份物理分离（P1-10） |

---

## 三、发现清单（P1 必须附 file:line + 铁律/模式归因）

### P1-1 【U8 FAIL】机器预审工具双死引用，合并后永远无法 exit 0 — 归因: implement

- `scripts/control-tower/pre-audit-summary.sh:45` 聚合的 U1 门禁指向 `scripts/control-tower/reconcile-bypass-log.sh`——**该文件在 main、u1、u8 任一分支均不存在**（`git ls-tree` 三方核实 = 0）。U1 实际实现是扩展存量 `check-bypass-log.sh`（D414 brief 明示"复用现有脚本，不新建"），spec 契约名与实现决策漂移未回填。
- `pre-audit-summary.sh:48` 对 `verify-claims-table.sh` 无参调用 → 该脚本零参数即用法错误 exit 2 → U4 门禁永久 degraded。
- **物理实证（演练 5）**：在 12 分支全部合并后的状态运行 `bash scripts/control-tower/pre-audit-summary.sh` → `⏳ U1 未落地 + ⚠️ U4 降级`，exit 2，输出"需先合并 U1/U4/U7"（误导——已全部合并）。即工具核心功能（"输出预审是否已过"）交付即死。
- 铁律 0-2（接线验收）/ 台账 M3（机制建成未接线）。
- 修复路径（二选一即可，改动 <5 行）：① U1 条目改指 `check-bypass-log.sh`；② U4 条目传入 `--task-id` 对应 dev doc 或改为"无 doc 时 skip 而非 degraded"。

### P1-2 【U5a】真 `--no-verify` ≤300s 窗口完全静默（检测回退）— 归因: devdoc

- `scripts/hooks/post-commit.sh:25` `FRESHNESS_SEC=300` + :37-39 判③ `merge-base --is-ancestor`。
- **物理实证（演练 3）**：临时仓库中合法 hooked 提交后，立即 `git commit --no-verify`（无 hook 模拟）→ 运行真实 `post-commit.sh` → **bypass.log 零记录**（无 detected-bypass、无 possible-bypass）。对照：`>300s` stale marker → 记 `possible-bypass diff=467s`（演练 6）。
- 旧判定（精确等 HEAD^）对同场景 100% 记 `detected-bypass` → 组 0/组 7c 熔断可触发。新判定下：≤300s 静默；>300s 仅 `possible-bypass`，而 `pre-commit-check.sh:104`（组 0）与 `:713`（组 7c）的 `grep -c " detected-bypass"` **不计 possible-bypass** → 熔断不触发。
- spec UPGRADE-SPEC:297 声称"三判 + freshness = 不明显放宽真绕过检测"——物理上不成立：5 分钟窗口内绕过完全不可见，窗口外降级为非熔断信号。
- 缓释事实：post-commit 本就是侦测式（非阻断式）控制；marker 是本地文件历来可伪造；该 tradeoff 消除了 D362 级全线死锁（可用性收益真实）。**判定：可合并，但创始人需知情接受该窗口；建议后续补"≤300s 真绕过应被抓"的负向断言测试 + 将 possible-bypass 纳入组 7c 计数。**

### P1-3 【U7】ct-test-gate git 不可用 fail-open（违反自身契约）— 归因: implement

- `scripts/control-tower/ct-test-gate.sh:28` `STAGED_ALL="$(git diff --cached ... || true)"` → git 不可用时暂存列表为空 → :32 判"无控制塔脚本变更" → `SYNC-OK exit 0`。
- 自身契约头 :18-19 明示"2 = 检查执行失败/降级（git 不可用等）"——实现与契约相反（铁律 47 / 台账 M1 fail-open）。
- 其余路径演练成立：改坏控制塔脚本 → exit 1 点名（演练 1）；新脚本无配对 → exit 1 点名（演练 2）。测试 6/6 复现绿。
- spec U7c（CI 兜底 job）未交付，但 D413 brief 已显式声明"不接 CI job（U7c 留后续）"——记为已声明的范围缩小，不计失实。

### P1-4 【U1】fail-open 只修一半；合并清单过度声称 — 归因: implement + devdoc

- 已交付（真实）：U1a 证据链随提交入库（`synova-commit:569-578`）；U1c② git log 失败 exit 2（`check-bypass-log.sh:50-56`）。施工窗口 bypass.log 有一条 BLOCKED 记录（`a3cec96` 分支 `.claude/bypass.log` 末行）——门禁真拦过的证据。
- 未交付：U1b（DEGRADED 补 HASH，brief 已显式不做）；**U1c① base 不可解析仍 exit 0**（`check-bypass-log.sh:41-43`，spec :100 要求改 exit 2，实现只加了 degraded-events.log）；U1c③ 时间戳统一；U1d（loop-context.sh 误报源 + pre-push-check.sh:71 虚假声称）。
- `MERGE-CHECKLIST-20260817.md` 声称 U1 = "对账 fail-open 修复"——物理上只修了 git-log-failure 一处，base-unresolvable  fail-open 仍在（台账 M2 声称 vs 事实）。
- 旁证：`check-bypass-log.sh:39` `git fetch origin`（无 BatchMode）SSH hang 风险仍在——本审计 session 的 `git fetch --all` 即实测超时，施工方"SSH hang bug"声称**属实**。

### P1-5 【U2】反向对账真拦，但三处 fail-open 残留 — 归因: implement

- 已交付（真实）：`check-dev-doc-write-set.sh` 反向对账段（:126-154）。**演练 8**：暂存 dev doc + 未登记代码文件 → exit 1 并逐行点名"实际变更但未登记进写集"。测试 4/4 复现绿。
- 残留①：无写集表仍 `SKIP exit 0`（演练实证，spec U2b 要求 exit 1）。
- 残留②：G12c 仍 `|| true` + ❌grep 判定（`pre-commit-check.sh:1023`）——脚本崩溃静默放行（spec U2c 未做）。
- 残留③：触发条件是"dev doc 同 commit 暂存"（:1021）——dev doc 先交、代码后交则对账永不运行（spec 施工隘口①裁决的 `.claude/current-dev-doc` 指针未做）。
- 新增段自身的 fail-open：`check-dev-doc-write-set.sh:138` `except Exception: out = ""` → 反向对账中 git 失败 = 空集 = 静默 PASS（台账 M1）。
- U2d（dev_doc_gatekeeper.py 双版漂移）brief 已显式不做。

### P1-6 【U5b】子目录 .env 暂存阻断缺口仍在 — 归因: implement

- 已交付（真实）：git 可用性预检（`check-secrets.sh:51-57`）。**演练 9b**：git 存根失败 + 植入 `sk-` 凭证 → exit 2 fail-closed；正常 git + 真凭证 → exit 1 阻断。测试 3/3 复现绿。
- 未交付：spec ② `check-secrets.sh:110` 暂存阻断仍 `grep -q '^\.env$'`——`config/.env`、`packages/x/.env` 等子目录 .env 被暂存时**不阻断**（安全门禁已知洞）。brief 声明"本任务只补 git 可用性预检"，范围缩小已声明；但洞为存量安全问题，需立项补做。

### P1-7 【U6】sop-gate 契约头声称的测试注入缝不存在 — 归因: implement

- `scripts/workflow/sop-gate.sh:13` 契约头 `@input — ...测试注入 SYNO_TEST_ARM=1 + 各步骤证据注入`——全脚本 grep `SYNO_TEST_ARM` 仅命中该注释行，**实现零注入缝**（铁律 47 契约优先 / 台账 M2）。配对测试改为在真实 `.claude/task-briefs/` 建临时文件 + trap 清理（非沙箱）。
- step 7 只校验 bypass.log 入库，未含 spec :353 的"交付报告声称↔证据对照表（U4）"校验（U4 时序在后，合并后仍缺）。
- 已交付（真实）：三步校验三态实现（测试 6/6 复现绿）；persona ⑦c 接线闭环——`install-dsh-preset.sh:35` 映射 `synova-dsh → docs/synova/coordination/dsh-preset-draft`，⑦c 正落在该源目录 `persona-block.yml:67`，install 后即含 sop-gate 引用（静态链路物理确认）。

### P1-8 【U4 advisory】v2 预跑版白名单必须收紧 — 归因: devdoc

- 本版（格式版）**不执行证据命令**，注入面无活性。**演练 4**：`rm -rf` 被拒（非白名单）、`$(curl ...)` 被拒（危险字符 `$`）、合法 grep 行通过。测试 9/9 复现绿。G12d 三态接线（`pre-commit-check.sh:1003-1016`）。
- 隐患：`verify-claims-table.sh:42` 白名单含 `python3 node sed awk`——均非只读。v2 预跑版若直接执行，`python3 -c "exec(chr(115)+...)"` 无需任何禁字符即可绕过。**v2 落地前必须移除/包裹这四项**（UPGRADE-SPEC 风险总表已自标"最高风险"，本报告予以确认）。

### P1-9 【证据链】18 个施工 commit 全部无 bypass.log COMMITTED 记录 — 归因: control-tower

- 逐 commit 对账（13 分支 × 18 commit）：无一存在于本分支 bypass.log。
- 物理旁证：在合并态运行 `check-bypass-log.sh`（base=458313f）→ 逐行点名全部 16 个非合并施工 commit"执行证据链断裂"——**对账工具本身工作正常**，断裂是 U1a 上线前的时代产物（施工用裸 `git commit`，未经 synova-commit 封装）。
- 台账 M4 第 5 次发生。U1a 合并后自愈（仅覆盖 synova-commit 路径；裸 git commit 路径靠 check-bypass-log 对账兜底，而兜底仍有 P1-4 的 fail-open 残留）。建议合并后按工具提示"一次性补记"。

### P1-10 【身份卫生】施工 commit 全部挂 K3 git 身份 — 归因: control-tower

- 18/18 施工 commit author=`kimi-k3-audit <k3-audit@synova.local>`（git log 物理证据）。实际施工方声明为 DSH 工程角色。问责链（谁施工谁负责）被 git 身份混淆。建议：施工机/施工 worktree 的 `user.name/email` 与 K3 审计身份物理分离，纳入 control-tower 环境自检。

---

## 四、P2 发现（记录跟进，不阻断）

| # | 分支 | 发现 | 证据 |
|---|---|---|---|
| P2-1 | u5a | GATEKEEPER ACK 逃生舱注释声称"写入 degraded-events.log"，实现未写 | `pre-commit-check.sh:100-102`（注释）vs `:110-116`（无写日志代码） |
| P2-2 | u3 | phantom 校验仅覆盖有 task-state 行的任务：无 task-state 的 untracked dev doc 不可见（演练 7 第一次实证）；`_head_tracked_files` 未处理 `core.quotepath` 中文路径转义（中文名工件可误判 phantom） | `gen-cto-health.py:170-187,232-238` |
| P2-3 | u3 | spec U3d（docstring :12 漂移 + 4 处静默吞错）未做 | UPGRADE-SPEC:205 |
| P2-4 | u1 | `synova-commit.test.sh` 为纯 grep 静态接线，无功能性 ride-along 测试（spec :115 验收要求"物理复现"）；`check-bypass-log.test.sh` 环境依赖——HEAD≠origin/main 时"无新提交应 exit 0"用例失败（合并态实测 3/4），非恒失败 | 演练与对照组实测 |
| P2-5 | u8 | 测试"接线"断言只 grep 门禁名字符串（`pre-audit-summary.test.sh:28-33`），不验证被引脚本存在——P1-1 漏检的结构性原因；U3 `--strict` 非 dry-run 运行，副作用重写 `docs/synova/CTO-HEALTH.md`（"只读聚合"不纯） | 实测 |
| P2-6 | console-panels | `docs/synova/founder-console.html` 生成快照入库（合并即过时——真相工具自带过时真相）；测试副作用写 `founder-console.html`/`founder-alerts.md` 到工作区（污染后续提交） | diff + 演练实测 |
| P2-7 | u5c | spec 证据索引"pre-commit:174 调用 verify-parallel"漂移——pre-commit 两侧均不调用（仅 pre-push:323） | 双侧 grep 实证 |
| P2-8 | u6 | sop-gate 测试在真实 task-briefs 目录建临时文件（trap 清理），非注入沙箱 | `sop-gate.test.sh:13,18` |
| P2-9 | 全局 | 委托书写"14 个分支"，物理核实审计目标 13 个（线① 10 + 线② 3）；merge-checklist 终版亦 13 | 委托书 vs `MERGE-CHECKLIST-20260817.md` |

---

## 五、五项审计范围逐项结论

1. **新提交真实性 ✅**：18 个施工 commit 的声称 ↔ 物理证据逐项核对，声称交付的代码全部真实存在且功能复现（9 项故障注入演练 + 12 个配对测试文件复跑）。发现的不是"声称做了没做"，而是"spec 全量 vs brief 收敛"的范围差——收敛均在 brief 显式声明（D412/D413/D414/D415/D417 brief Q2 实证），唯 merge-checklist 对 U1 的表述过度（P1-4）。
2. **接线完整性 ⚠️**：U7→pre-commit 组 2d、U4→G12d、U6→persona ⑦c（install 源目录）、U5c→pre-push 分流、U3→U8 聚合，均物理确认真实调用链。**唯 U8 两处接线断裂**（P1-1）；U2 经 G12c 的 ❌grep 可拦但崩溃即静默（P1-5②）。
3. **门禁有效性 ⚠️**：9 项故障注入演练——U7 拦坏脚本/拦无配对 ✅、U4 拒注入 ✅、U2 拦未登记 ✅、U5b 拦真凭证/拒 git 降级 ✅、U3 拦 phantom ✅、U8 合并态 exit 2（fail-safe 方向但功能死）⚠️、**U5a ≤300s 真绕过静默 ❌**（P1-2）。
4. **红线 ✅**：见 §二（scripts/audit 零触碰；施工窗口零 --no-verify；无自我审计；U8 无裁决）。观察项：身份混淆（P1-10）。
5. **文档豁免纪律 ✅**：CT-34 `is_doc_only` 完好（`pre-commit-check.sh:158-166`，fail-closed 设计），GATEKEEPER 先于豁免（:170 注释）；13 分支中 12 个代码分支均含非文档文件（正确受全量约束），`audit/product-lines-verification` 单 md 文件（正确豁免）。

**附加验证（施工方声称复核）**:
- "按序合并零冲突"——**属实**：本地 scratch clone 按 merge-checklist 顺序合并 12 分支，全部干净（物理演练）。
- "测试全绿"——**基本属实**：合并态复跑 12 个配对测试文件，11 全绿；`check-bypass-log.test.sh` 3/4 为环境依赖失败（HEAD≠origin/main，已定性为测试密封性 P2-4，非恒失败，非实现缺陷）。
- CI 结论——**无法核验**：本环境无外网（GitHub API/SSH 均超时），CI job 级证据缺失；以本地全量复跑替代（更强证据）。
- 审计基线：`scripts/audit/audit-check.py --full` main 基线 434 FAIL vs 合并态 434 FAIL——**零新增**（13 分支不触碰 src/ TS，构造性一致）。

---

## 六、跑偏第二道（北星三问复核）

对照 `.claude/PRODUCT-BRIEF.md` 机械判断：

1. **服务真实用户场景吗？** 本批为控制塔质量门禁 + 创始人控制台，属工程基建而非直接 FDE/企业主场景。但 PRODUCT-BRIEF 第八节（Loop Engineering/产品对齐）明确涵盖该方向，且控制塔是项目自 5 月以来的既定投入线——**不判偏离**。
2. **更接近终态吗？** U1-U7 把复发 2-4 次的过程问题固化为物理门禁，founder-truth 把"任务真相"从自报改为 git 物理核验——收敛性建设，非横向扩张——**不判偏离**。
3. **做完后 Synova 变味吗？** 零产品行为变更（无 src/ L1-L5 改动），不改变"驻扎企业、主动诊断、为增长服务"的产品本质——**不判偏离**。

注：单日 13 分支全部投向内部基建、零产品功能，投入比例是否失衡属创始人排期决策，非审计偏离。

---

## 七、L4 防线缺口收割（"本该拦住它的防线是什么？为什么没拦住？"）

| 发现 | 本该拦住的防线 | 为什么没拦住 | 缺口归类（对账 M1-M8） |
|---|---|---|---|
| P1-1 U8 双死引用 | ① U8 自身接线测试 ② 铁律 0-2 WIRE CHECK | ① 测试断言只 grep 门禁**名字**而非被引脚本**存在**（断言写弱）；② 跨分支集成无任何门禁——U1 在分支 A 改名实现、U8 在分支 B 按 spec 旧名引用，单分支各自全绿，**只有合并后才断** | M3 强化：接线断言必须验证被引对象物理存在；**新增缺口类建议 M9：跨分支集成断裂——无"合并后集成态"验证环节**（建议机制：pre-merge 合并演练 + 集成冒烟，而非每分支单测） |
| P1-2 U5a ≤300s 窗口 | ① spec 安全分析 ② 配对测试 | ① spec 层即接受 tradeoff 且声称"不明显放宽"（判断失误）；② 测试只有 S9（>300s 被抓）正向断言，**缺"≤300s 真绕过应被抓"负向断言**——红绿演练没覆盖攻击者快路径 | M1 强化：安全关键判定变更必须配负向测试（攻击场景红断言）；tradeoff 决策留"创始人/K3 批准"硬记录 |
| P1-3 U7 git-fail fail-open | 契约门禁（铁律 47） | 契约头写了 exit 2，实现 `\|\| true` 吞掉——契约门禁只查"有无契约注释"，**不查契约条款是否兑现** | M1/M2 强化：契约-实现一致性抽检（本报告人工充当该角色，机器化待立项） |
| P1-9 18 commit 无证据链 | post-commit bypass 检测 | 施工用裸 `git commit`（非 synova-commit），COMMITTED 记录机制根本不在路径上；post-commit 检测依赖 marker，而 marker 只证明 pre-commit 跑过、不产生 COMMITTED 记录 | M4 已建防线（U1a），但仅覆盖 synova-commit 路径；裸 commit 路径靠对账兜底，兜底 fail-open 残留（P1-4） |
| P1-10 身份混淆 | 无防线 | 施工机 git config 即 K3 身份，无任何环境自检校验"施工身份 ≠ 审计身份" | **M9 候选②**：建议 control-tower 环境自检加 identity 校验（一次性机制，覆盖本类） |

**防再犯守门人注记**：M9（跨分支集成断裂）为本次唯一新提议类，候选机制二选一：① pre-merge 合并演练脚本（机器证据）；② 施工身份环境自检。每类只加一个机制，符合 anti-bloat 原则。

---

## 八、运行环境注记

- 审计机：macOS（Darwin），bash 3.2 + python3，Git 2.x；**无外网**（GitHub API/SSH 均超时——故 CI 结论无法远程核验，以本地全量复跑替代；`git fetch` 实测超时，旁证施工方"SSH hang bug"声称属实）。
- 合并演练与全部测试在 `/tmp/synova-k3-mergetest`（本仓 scratch clone，自 origin/main 458313f 按 merge-checklist 顺序合并 12 分支）执行，零写入产品仓库。
- 故障注入在 `/tmp/k3-bypass-drill`、`/tmp/k3-u4-drill` 临时仓库执行。
- 测试复跑结果与"环境"强相关项已逐一定性（P2-4：HEAD==origin/main 依赖性），无"恒失败"误判。

## 九、审计材料清单（7 项自收集记录）

1. 任务提交集：13 分支 × 18 commit（`git log origin/main..origin/<branch>` 逐分支映射）✅
2. Git diff：逐分支 `--stat` + 实现文件全文 diff ✅
3. Dev doc / 施工 spec：`UPGRADE-SPEC-控制塔与审计流程-20260817.md`（516 行全文）✅
4. Task brief：D412/D413/D414/D415/D416/D417/D423/D424 等 Q2 范围声明逐一核读 ✅
5. AGENTS.md + PRODUCT-BRIEF 方向依据 ✅
6. 审计基线：`audit-check.py --full` main 434 FAIL vs 合并态 434 FAIL ✅
7. 执行证据：bypass.log 全量对账（5 历史 detected-bypass + 18 commit 无记录 + 1 施工 BLOCKED 记录）；CI 不可达已声明 ✅

---

*本报告为 K3 独立结论，未采纳任何施工方自报。FAIL/CP 项修复后走复审（只审变更）。*
