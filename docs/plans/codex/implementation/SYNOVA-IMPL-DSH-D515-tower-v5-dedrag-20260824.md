<!-- SYNOVA-IMPL-DSH-D515: 控制塔 V5.0.0 减负重构 — 三批 13 项 -->
<!--
  状态: dev doc 完整版（自包含，执行方零上下文可执行）
  作者: 当前 CTO session (dsh-cto) | 2026-08-24
  执行方: 新 CTO session（创始人指定）——你没有本 spec 之外的上下文，本文件是唯一信息源
  优先级: P0 | 版本编排: V5.0.0（MAJOR——门禁体系收缩性重构，见 §0.4）
  上游: 创始人裁决"三批全部做" + Codex P1-P10 分析（2026-08-24 推送）+ CTO 独立调研（51 检查点量化）
-->

# D515: 控制塔 V5.0.0 减负重构

> 一句话：把提交链路从"51 检查点全硬阻断 + 补记死循环 + 并行互踩"重构为
> "4 道硬门禁 + 一次性全量报告 + 物理隔离 + 命中统计"。目标：典型小改动交付
> 从 1 小时拉扯降到 10 分钟内，同时质量根（防真实事故的检查）一毫米不减。

---

## 0. 必读背景（执行前读完，10 分钟）

### 0.1 问题定性（两份独立调研同结论）

**CTO 调研（2026-08-24 实测）**：pre-commit-check.sh 内 **51 个检查点**；
pre-commit 单跑 7s（性能不是问题）；pre-commit-failures.log 31 条记录中
绝大多数是**同一任务反复重试**（不是拦住不同 bug）；历史门禁体系从 v3.0 的
5 项膨胀而来，**从未做过"是否还在防住东西"的清理**。

**Codex 分析（P1-P10，Win 侧 V4.9.2 部署实测）**：
- P1（最痛，3 次复发）：实现 session 不用 worktree，主树被多 session 占用
- P2：纯补记提交（只改 bypass.log）仍跑全量 13 组，每次 90-120s；G12 一行修复累计跑 5 次全量 pre-commit
- P3：VERSION bump 后 push 被 D319 拦需手动补 tag
- P4：docs 级补记走完整 PR 流程每轮 5-8 分钟
- P5：改 scripts/ 被 G12 拦但无文档说明需认领 brief
- P6：brief Q2 排除项报错无定位（不指出哪个排除项哪一行）
- P7/P8：已闭环（V4.9.1 D513 四项 + V4.9.2 G12 task-state 豁免）
- P9/P10：网络不稳放大所有摩擦（443 断连 ≥5 次/fetch 中断致 tracking ref 陈旧）

### 0.2 已有的地基（不要重复建设！以下全部已在 main）

| 机制 | 位置 | 状态 |
|---|---|---|
| `synova-commit --check` 全量 dry-run（一次报全） | scripts/control-tower/synova-commit（D508） | ✅ 可用 |
| 对账 merge-base 化 + 防御性 fetch | check-bypass-log.sh（D508+D513③） | ✅ |
| COMMITTED 登记提前到 commit 瞬间 | synova-commit（D508） | ✅ |
| MERGE_HEAD 豁免 / PYBIN 探测 / brief 指向修正 | D513 ①②⑤⑥ | ✅ |
| G12 task-state 豁免 | V4.9.2（Win PR #142） | ✅ |
| F5 口径防线（计数须贴 vitest summary） | synova-commit（D514） | ✅ |
| worktree-manager（create/finish/gc/status） | scripts/control-tower/（Win D307） | ✅ 可用 |
| D507 并行门禁（多 session + 主区提交 → 拦截） | synova-commit（D507 段） | ✅ 只挡提交不挡开工（本任务补） |
| 版本管理规范 | docs/synova/coordination/版本管理规范-控制塔.md | ✅ |
| alloc-task-id 生成 brief 骨架 | D508③ | ✅ |

### 0.3 红线（违反 = 事故）

1. **不碰 scripts/audit/**（K3 专属）
2. **质量根保留清单**（这 4 类检查一个不能删、不能降级——它们防住过真实事故）：
   - as any 零容忍（47 次历史事故）
   - 测试配对 + expect 断言（4 次接线失败 + 空壳测试）
   - Secrets 扫描（真实泄漏史）
   - 接线物理事实（新 export 必须被引用——防"机制建成未接线"，M3）
   - 外加：K3 审计链路（task-state 状态机 + 审计报告入库）不动
3. **M13 教训**：测试沙箱的 git 一律 `git -c user.*=` 一次性参数 + GIT_DIR/GIT_WORK_TREE 环境变量隔离，**禁止 `git config` 持久写入**（GIT_DIR 只隔 index 不隔 config——本项目已 4 次污染事故）
4. **提交纪律**：先 `--check` 一次看全 → 一次修完 → 真提交。文件改完立即 `git add`（暂存即保险）。**绝不在主工作区工作**——全程在专属 worktree（见 §4.1）

### 0.4 版本编排

V5.0.0（MAJOR）：门禁体系收缩性重构（硬阻断数量变化 + 语义变化）。
VERSION.md 条目 + version.log + tag **与最后一批代码同 commit 或紧随**。
分批落地时每批可先 PATCH bump（V4.9.3/4.9.4），全部完成后统一打 V5.0.0 tag
并在 VERSION.md 写总条目（两种方案选一，spec §6 定）。

---

## 1. 三批 13 项规格（每项：改哪/怎么改/验收）

### 第一批（P0 收益最大）

#### 项 1：并行隔离物理强制——task-start 拦截 + pre-commit 告警（Codex P1）

**改**：`scripts/workflow/task-start.sh` + `scripts/pre-commit-check.sh`

**规格**：
1. task-start.sh 开头（参数校验后）加检测：
   - `git status --porcelain` 非空（主树有未提交改动）**且** session-registry 有其他活跃 session（复用 synova-commit D507 段的判定方式：`python3 session_registry.py list --active` 计数去重本人）→ **硬拦截**（exit 1），提示文案含具体命令：
     `python3 scripts/control-tower/worktree-manager.py create <任务名>` + `cd ../synova-wt-<任务名>`
     （main 上的 Win D307 版：分支名自动为 `session/<任务名>`，worktree 目录 `../synova-wt-<任务名>`——finish 时 manager 会校验已 push 后清理）
   - registry 不可读 → 显式降级提示（不静默，铁律 11）
2. pre-commit-check.sh 组 6 区域加软检查（主树提交时活跃 session>1 → 黄色告警，不阻断——CI 权威原则）

**验收**：
- [ ] 双 session 场景实测：主树有脏文件 + registry 有他人 → task-start 拦截
- [ ] 单人场景：不拦截（零摩擦）
- [ ] worktree 内 task-start：不拦截（worktree 本来就该允许）

#### 项 2：纯补记提交豁免——只跑证据链组（Codex P2，砍一半提交时间）

**改**：`scripts/pre-commit-check.sh`

**规格**：在组 1 之前加前置判定：
```bash
# V5/P2: 纯补记提交（仅 .claude/bypass.log）→ 只跑 Secrets + 跳过其余组
# ⚠️ 坑（D515 spec 自查发现）: synova-commit 的 D414 机制会把 bypass.log 自动 add
# 进正常提交——判定必须用「--check 场景标志 or 用户显式 --files 仅为 bypass.log」，
# 不能裸看 git diff --cached（会被 D414 误触发 → 正常提交走快速通道 = 质量根被绕过）。
# 正确判定：synova-commit 传 SYNO_FASTLANE=1 环境变量（当且仅当 --files 列表仅
# 含 .claude/bypass.log 时），pre-commit-check.sh 检查该变量而非自己猜暂存区。
if [ "${SYNO_FASTLANE:-0}" = "1" ]; then
  # 仅跑 Secrets（证据文件也可能泄密）→ 过了直接 exit 0
fi
# synova-commit 侧配套: --files 解析后，若 FILES 数组长度==1 且为 .claude/bypass.log
# → export SYNO_FASTLANE=1 再调 pre-commit-check.sh
```
- Secrets 保留（bypass.log 内容也扫）；对账（D331）由 pre-push 兜底无需重复
- 输出必须显式："✅ V5 纯补记快速通道：仅 bypass.log + Secrets，跳过 12 组"

**验收**：
- [ ] 仅暂存 bypass.log 的提交 <3s 完成（现在 90-120s）
- [ ] bypass.log + 其他文件混合 → 走全量（防借道绕过）

#### 项 3：提交端硬阻断收敛到 4 道（CTO 调研核心项）

**改**：`scripts/pre-commit-check.sh`（结构调整，判定逻辑不动）

**规格**：
- **保留硬阻断**（4 类，§0.3 质量根）：①as any ②测试配对+expect ③Secrets ④接线物理事实
- **降为软提示**（其余全部 hard_check → 语义改 warn 不 exit）：架构边界、G10-G13 全组、brief 六字段、plan-integrity 类、契约门禁、文件驱动、CP3 等——**判定代码原样保留**（继续输出报告供 --check 和 K3 查看），只是不再阻断提交；CI 上由 Iron Laws job 作为权威（ci.yml 已有）
- 组结构不删（13 组 echo 保留，报告完整性不变——K3 依赖这些输出审计）
- 输出加一行汇总：`⚠ V5: X 项软提示（详情见上）——CI 为权威，本地不阻断`
- **特例**：G12d 生成物单点（D458）和 G13 技能同步**保持硬阻断**（这两个防的是 CI 产物污染和双目录漂移，误报率低且命中即真事故——保留理由写进代码注释）

**验收**：
- [ ] 构造 10 类历史拦截场景（从 pre-commit-failures.log 取真实案例），4 类质量根仍全拦
- [ ] 其余 6 类（brief 字段类/Q2 类/G12 认领类）只告警不拦
- [ ] `--check` 模式输出与之前完全一致（报告能力不减）

### 第二批（P1 本周）

#### 项 4：门禁命中统计（度量地基）

**改**：`scripts/pre-commit-check.sh` + 新 `scripts/control-tower/gate-stats.sh`

**规格**：hard_check/soft_pass 每次触发（无论过/拦）追加一行到 `.claude/gate-hits.log`（gitignore 运行态）：
`<ISO时间> | <组名> | <hit|miss> | <branch>`；gate-stats.sh 汇总近 30 天：每检查点的命中次数、拦截次数、误报率（拦截后同任务下次直接过的算误报代理指标）。**为月度清理提供数据**（零命中或误报>50% 的门禁进删除候选清单）。

**验收**：[ ] 跑 10 次提交后 gate-hits.log 可统计出每检查点数据；[ ] gate-stats.sh 输出 Markdown 表

#### 项 5：Q2 排除项报错带定位（Codex P6）

**改**：`scripts/check-plan-integrity.sh`（"Q2 排除项缺少文件路径"分支）

**规格**：报错从"必须引用具体文件名"改为：附**违规排除项原文 + brief 内行号**（awk 遍历时记 NR）+ 一行修复示例（`- 不改 src/xxx/yyy.ts — 原因`）。

**验收**：[ ] 构造违规 brief，报错含原文与行号

#### 项 6：VERSION 头部 bump-tag 说明（Codex P3）

**改**：`.codex/control-tower/VERSION.md` 头部 + `docs/synova/coordination/版本管理规范-控制塔.md`

**规格**：两处各加一条："**bump 必须同 commit 打 tag**（synova-commit 自动；手动 git commit 场景：`git tag V<x.y.z> && git push origin V<x.y.z>`，否则 push 被 D319 拦）"。

**验收**：[ ] 两文档 grep "bump 必须" 命中

#### 项 7：纯文档 PR 的 CI 瘦身（Codex P4）

**改**：`.github/workflows/ci.yml`

**规格**：quality job 加前置：`git diff --name-only origin/main...HEAD | grep -qvE '\.(md|json)$|task-state/|\.claude/' || exit 0`（全为文档类 → 跳过 TS+Lint+Iron Laws 的重检查，Secrets 保留）。**只跳 job 内步骤，不跳 job**（PR 状态仍可读）。

**验收**：[ ] 纯 docs PR 的 TS+Lint 秒过；[ ] 混合 PR 正常全量

### 第三批（P2 环境韧性）

#### 项 8：git 网络韧性配置（Codex P9）

**改**：`scripts/install-hooks.sh`（追加 git config 段，幂等）

**规格**：`git config http.lowSpeedLimit 1000; git config http.lowSpeedTime 30`（30s 低于 1KB/s 即断，快速失败）；文档提示 push 重试习惯。

#### 项 9：tracking ref 陈旧提示（Codex P10）

**改**：`scripts/control-tower/check-bypass-log.sh`（D513 防御 fetch 的 catch 分支）

**规格**：防御 fetch 失败时输出（现有 || true 静默处）："⚠ fetch 失败——base 可能陈旧（push URL 不更新 tracking ref）；建议 `git fetch origin` 后重试"。

#### 项 10-13（Codex P5 + 遗留）：

- **项 10**（P5）：DSH 门禁文档加"改 scripts/ 需认领 brief"说明——落 `docs/synova/coordination/版本管理规范-控制塔.md` §新增或 PARALLEL-DISCIPLINE.md；同时把该提示加进 G12 拦截输出的修复指引文案（pre-commit-check.sh G12 段 echo）
- **项 11**：D508 `--check` 的 plan-integrity 段对纯补记/纯 docs 场景同步走快速通道（与项 2 联动）
- **项 12**：worktree-manager 补齐 D513 曾计划的 union driver 之外的 `.gitattributes` 检查——`status` 子命令顺带显示 merge driver 配置健康度（bypass.log/reference-map 两文件 union 是否注册）
- **项 13**：本任务自身的经验沉淀——执行完后把"V5 重构过程中的新教训"写入 memory/notes/implemented/（D395-a 要求，commit message 引用该路径）

---

## 2. 写集（预期，实现时可微调但需在交付报告回填差异）

| 文件 | 项 |
|---|---|
| scripts/workflow/task-start.sh | 1 |
| scripts/pre-commit-check.sh | 1,2,3,5,10 |
| scripts/check-plan-integrity.sh | 5 |
| scripts/control-tower/gate-stats.sh（新） | 4 |
| .codex/control-tower/VERSION.md | 6,0.4 |
| docs/synova/coordination/版本管理规范-控制塔.md | 6,10 |
| .github/workflows/ci.yml | 7 |
| scripts/install-hooks.sh | 8 |
| scripts/control-tower/check-bypass-log.sh | 9 |
| scripts/control-tower/worktree-manager.py | 12 |
| tests/control-tower/*.test.sh（新增≥5 个配对） | 全部 |
| memory/notes/implemented/（D515 Note） | 13 |

**不碰**：scripts/audit/、src/（产品代码零改动）、dsh/plugins/task-board-adapter/（另一线在用）

## 3. 测试要求（铁律 0-2/48）

- 每个改动脚本配对测试（U7/CT-40 强制）：task-start-parallel / fastlane-bypass-only / hard-gate-convergence / gate-stats / q2-error-locating（≥3 expect 或 ≥3 断言）
- 项 3 的收敛测试是**重中之重**：10 个历史拦截场景回归（4 保 6 放）——从 pre-commit-failures.log 的真实案例构造
- 全部沙箱遵守 M13（git -c + GIT_DIR）
- 先 red 后 green（铁律 0-2）

## 4. 执行纪律（防你自己被拉扯——本任务就是治拉扯的，别自己陷进去）

### 4.0 环境自愈（开工前必做，30 秒）
```bash
cd /Users/wane/SynovaAgent
# 坑0a: core.bare 可能被历史事故误设 true（Codex P10 记录过、2026-08-24 仍复发）——
#        症状 "fatal: this operation must be run in a work tree"
git config core.bare false
# 坑0b: 主树可能被其他 session 占用（分支非 main/有暂存）——不要 checkout/清理，
#        你只做 fetch + worktree（都不碰工作区）
```

### 4.1 开工
```bash
cd /Users/wane/SynovaAgent
git fetch <https-url> main:refs/remotes/origin/main   # 主树可能被占，fetch 不动工作区
git worktree add ../synova-wt-D515 -b feat/d515-tower-v5 origin/main
cd ../synova-wt-D515 && ln -sf /Users/wane/SynovaAgent/node_modules node_modules
```

### 4.2 每批提交
- 改完文件**立即 git add**；全批完成 → `SYNO_GATEKEEPER_ACK=1 bash scripts/control-tower/synova-commit --task-id D515 --agent dsh-cto --message "..." --check`（一次看全）→ 修 → 真提交（无 --check）
- brief 一开始就写全（六字段 + 全部写集文件列进 Q2 + Done verify ≥4 条含 `bash tests/...`）；commit message 多行 body 引用 `memory/notes/...`（D395-a 门禁要求）
- **网络断**（443 不通）：GitHub REST API 通道已验证可行（blob→tree→commit→ref），但**必须推完整文件集**（历史上挑文件推送曾导致内容丢失——D509 教训），推后用 contents API 逐项核验落地
- push 被对账拦：先看缺哪个 hash（脚本会列）→ D451 补记一行（含完整 40 位 hash）→ 再推。最多一轮，不死循环（D508 登记提前机制已在 main，新提交不会再自指）

### 4.2.1 finish 与网络
worktree-manager finish 用 ls-remote 校验分支已 push（PUSH_URL=github.com）。网络断时
finish 会误判"未 push"拒绝清理——此时可 `--keep-branch` 先清理目录、分支留待网络恢复；
或直接 `git worktree remove ../synova-wt-D515`（提交已 push 过即可安全清）。

### 4.3 完成标准（全部满足才算完）
- [ ] 13 项逐项验收命令全绿（每项的 verify 在 §1）
- [ ] 新增配对测试全绿 + 既有 check-bypass-log/synova-commit/g12 系列测试无回归
- [ ] VERSION.md V5.0.0 条目（含 13 项明细）+ tag
- [ ] task-state/D515.json → impl_done + impl.commit + files
- [ ] PR → CI 全绿 → **CTO（派单方）合并**（合并权 2026-08-23 起归 CTO，见 docs/synova/coordination/合并权修订-20260823.md）
- [ ] 交付报告（U4 声称↔证据表，覆盖全部 13 项 DS，descope 显式标注）→ 提 K3 审计

## 5. 并行冲突声明

- D511（版本守卫门禁）dev-doc 线在做——**与项 3 都改 pre-commit-check.sh，冲突！** 执行前先查 D511 状态（spec 撰写时 D511=claimed 未动工）：若已 impl_done/merged → 基于其之上做；若在进行中 → **项 3 等 D511 合并后再动**（先做项 1/2/4-13）
- D512（GS 刷新）改 golden-scenarios/evidence——与本项目零重叠 ✅
- D510 线已全部闭环 ✅

## 6. 待执行方定的两个小决策（不影响方向，spec 给了倾向）

1. 版本号策略：分批 PATCH（V4.9.3→...）还是一次性 V5.0.0？——**倾向：每批一个 PATCH，最终批打 V5.0.0 tag + VERSION.md 总条目**（tag 锚点校验友好）
2. gate-hits.log 格式：纯文本行 vs JSONL？——**倾向 JSONL**（gate-stats.sh 解析稳）

## 7. 完成后通知

PR 合并后：通知当前 CTO session（派单方）复核 + 派 K3 审计。审计通过后本 spec 的
13 项全部闭环，控制塔进入 V5.0.0 时代——预期效果（写给创始人看的验收）：
**典型小改动交付 1 小时拉扯 → 10 分钟内**。
