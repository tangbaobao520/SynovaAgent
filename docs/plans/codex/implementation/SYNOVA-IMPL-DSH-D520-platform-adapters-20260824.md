<!-- SYNOVA-IMPL-DSH-D520: 控制塔跨平台适配收口 + 版本纪律 -->
<!--
  状态: dev doc 完整版（自包含，执行方零上下文可执行）
  作者: 当前 CTO session (dsh-cto) | 2026-08-24
  执行方: 并行 CTO session（创始人指定）——本文件是唯一信息源，无对话上下文
  优先级: P0 | 版本编排: V5.0.0 → **V5.0.1（每次迭代必须 bump，见 §0.3）**
  上游: Codex 跨平台策略建议（Win 侧实测，2026-08-24）+ CTO 逐项核实（全部确认成立）
-->

# D520: 控制塔跨平台适配收口（CRLF/python3/fastlane/双平台 CI/checklist）

> 一句话：控制塔**一套逻辑内核 + 平台适配层收口 + 双平台 CI 强制验证**。
> 不拆两套（双维护必语义漂移，K3 审计失去地基）。本任务把 Win 侧实测暴露的
> 三个适配层遗漏全部收口，并立"平台差异 checklist"物理文件防第四次复发。

---

## 0. 必读背景（执行前读完）

### 0.1 为什么做（Codex 实测 + CTO 核实，全部确认）

| # | 问题 | 严重度 | 核实 |
|---|---|---|---|
| P0 | **task-start.sh 并行拦截 CRLF bug**：`_PAR_N` 只 `tr -d '\n'` 没清 `\r`，Windows 下 `[[ "3\r" -gt 0 ]]` 算术错误 → **Win 线并行隔离空转**（08-16 起 3 次并行复发 P1 的病根） | P0 | ✅ CTO 核实 L44 代码 |
| P1 | **双平台 CI 缺失**：control-tower-tests 只跑 ubuntu + 只含 5 个旧密封测试；task-start-parallel/fastlane 新测试不在 CI → 平台问题只能等 Win 实测暴露 | P1 | ✅ 核实 ci.yml L108 |
| P1 | **适配层未收口**：PYBIN/python3（D513 已修）、CRLF（本次）、fastlane Windows 慢（Secrets 全扫 25s）——三个问题三个地方，无公共模式 | P1 | ✅ 核实 |
| P2 | **D516 事故根因**（与平台无关但同批查）：API merge 选错 base 树覆盖 D481/D482（D509 同型第二次） | P0 复盘 | ✅ 已复盘（根因=API 绕过 git 三方合并语义） |

### 0.2 红线（违反 = 事故）

1. **不碰 scripts/audit/**（K3 专属）
2. **质量根保留清单**（一个不能删/降）：as any / 测试配对 / Secrets / 接线物理事实 + G12d/G13 特例
3. **M13 教训**：测试沙箱 git 一律 `git -c user.*=` + GIT_DIR/GIT_WORK_TREE 环境变量隔离，**禁 `git config` 持久写入**
4. **M15（本任务新增）**：**API 只允许传输（push blob/tree/commit/ref 新文件），禁止 API 做 merge 提交**——merge 必须 git 本地三方语义或 GitHub PR 按钮。任何涉及树的写入后必须 `git diff <上一个已知好commit>..HEAD` 冒烟对比关键文件
5. **提交纪律**：先 `--check` 一次看全 → 一次修完 → 真提交；文件改完立即 `git add`；全程专属 worktree（见 §4）

### 0.3 ⚠️ 版本纪律（创始人点名要求，每任务必读）

**每次迭代控制塔版本必须升级。** 本任务 = V5.0.0 → **V5.0.1**（PATCH：bug 修复 + 平台适配）。

| 动作 | 命令/位置 | 验收 |
|---|---|---|
| VERSION.md 顶部插入 V5.0.1 条目 | .codex/control-tower/VERSION.md（含变更明细/验证/作者，格式对齐 V5.0.0 条目） | 条目存在 |
| version.log 追加 JSON 行 | .codex/control-tower/version.log（gitignore 运行态，本地追加） | 行存在 |
| **bump 与代码同 commit** | 见规范 docs/synova/coordination/版本管理规范-控制塔.md | commit 内含 VERSION.md |
| **tag V5.0.1** | 合并 main 后 `git tag V5.0.1 && git push origin V5.0.1`（手动 git commit 场景必须手动打 tag，否则 push 被 D319 拦） | tag 指向 main 头 |

> 历史教训：V4.8.0→V4.9.0 之间六批变更未 bump（CT-42 第二次违反），创始人 2026-08-23 亲自纠正并立规范。本任务执行方若分多次 commit，**每次涉及控制塔行为变更的 commit 都要带对应 bump**（可 V5.0.1 一批 + 中间 PATCH），最终 tag V5.0.1。

---

## 1. 任务规格（按优先级）

### 任务 1（P0）：task-start.sh CRLF bug 修复

**改**：`scripts/workflow/task-start.sh`（并行拦截段，L44 附近）

**现状代码**：
```bash
_PAR_N="$(echo "$_PAR_ACT" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('sessions',[])))" 2>/dev/null | tr -d '\n' || echo "")"
if [[ -n "$_PAR_N" && "$_PAR_N" -gt 0 ]]; then
```

**修法**（数字清洗，防 CRLF 残留）：
```bash
_PAR_N="$(echo "$_PAR_ACT" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('sessions',[])))" 2>/dev/null | tr -d '\r\n' || echo "")"  # D520: tr 清 \r\n（Windows CRLF 残留致 [[ 1\r -gt 0 ]] 算术错误→拦截空转）
_PAR_N="${_PAR_N//[^0-9]/}"  # D520: 二次清洗——只留数字，杜绝任何隐藏字符
if [[ -n "$_PAR_N" && "$_PAR_N" -gt 0 ]]; then
```

**配套测试**：`tests/control-tower/task-start-parallel.test.sh` 加 Windows CRLF 回归用例：
- 模拟 `_PAR_N="3\r"`（含 \r）→ 断言清洗后拦截生效（exit 1 路径可达）
- 模拟 `_PAR_N="0"` → 不拦截（单人语义保留）
- 现有 mac 用例不得回归

**验收**：
- [ ] bash tests/control-tower/task-start-parallel.test.sh 全绿（含新 CRLF 用例）
- [ ] 在 Windows Git Bash 复跑该测试全绿（或 CI windows 矩阵覆盖）

### 任务 2（P1）：跨平台 CI 强制

**改**：`.github/workflows/ci.yml` 的 control-tower-tests job

**规格**：
1. job 加矩阵 `os: [ubuntu-latest, windows-latest]`，step 用 `bash`（Windows 上 Git Bash 自带；runner 需确认 bash 在 PATH——`shell: bash`）
2. 把密封测试扩展进列表（当前 5 个 → 加 task-start-parallel / fastlane-bypass-only / ci-strict-mode / gate-stats 等**依赖 mktemp/注入缝的密封测试**——凡不依赖真实仓库状态、可沙箱跑的都要进 CI）
3. 测试脚本内路径/命令需双平台安全：`mktemp`（Git Bash 有）、`date -Iseconds`（Windows Git Bash 有）、`tr`（有）——跑不通的加平台守卫 `uname | grep -qi MINGW && skip` 并计数

**验收**：
- [ ] PR 上 windows-latest job 出现且 5+ 个密封测试双平台全绿
- [ ] scripts/ 变更 PR 的 CI 显示 ubuntu+windows 两行 control-tower-tests

### 任务 3（P1）：适配层收口 — PLATFORM-CHECKLIST.md

**新建**：`scripts/control-tower/PLATFORM-CHECKLIST.md`（物理文件，防第四次复发）

**内容**（覆盖已知全部平台差异，格式=checklist，每条含"为什么/修法示例"）：
1. **PYBIN 三级探测**（python3/python/py + import sys 可用性）——D513 先例，替换任何裸 python3
2. **CRLF 清洗**（`tr -d '\r\n'` + 数字清洗 `//[^0-9]/`）——凡 python/命令输出进算术/比较前必清
3. **路径处理**（git -c core.quotepath=false——D339；中文文件名）
4. **UTF-8 强制**（PYTHONIOENCODING=utf-8——D313）
5. **date 兼容**（macOS `date -v+1d` vs GNU `date -d`——D366 已有 DAY_WINDOW 先例）
6. **mktemp 沙箱**（tests 专用）
7. **grep -P 不可用**（macOS BSD grep 无 -P——D313）
8. **timeout 缺失**（macOS 无 GNU timeout，需 gtimeout 探测——D334）

**接线**：`scripts/pre-commit-check.sh` 加一个软检查（hard_check 或 v5_soft——参照 V5.0.0 软提示体系）：新增控制塔脚本（scripts/control-tower/ 或 scripts/workflow/ 新文件）diff 中若含 `python3`（非 PYBIN 模式）、`date +%s` 等裸平台敏感命令 → 提示"见 PLATFORM-CHECKLIST.md"。

**验收**：
- [ ] PLATFORM-CHECKLIST.md 存在且 8 条全齐
- [ ] pre-commit 接线断言：构造含裸 python3 的新脚本 → 被软提示点名 checklist

### 任务 4（P1，复盘落地）：API merge 禁用纪律 + 冒烟终验

**改**：`docs/synova/coordination/版本管理规范-控制塔.md` 加 §（或独立文档）

**规格**：
1. 明文写死："**API（GitHub REST）只允许 push 传输（blob/tree/commit/ref 用于推送新文件）；禁止用 API 做 merge 提交**——merge 用 git 本地（三方语义）或 GitHub PR merge 按钮。违反 = 数据丢失级事故（D509/D516 两次实证）"
2. "涉及树的写入后必做冒烟终验"：`git diff <上一个已知好commit>..HEAD --stat` 核对只含预期变更；关键文件 grep 特征串
3. 该文档已存在（创始人 2026-08-23 立）——本次追加章节即可，非新建

**验收**：
- [ ] 规范文档含"API 禁 merge"条款 + "冒烟终验"清单
- [ ] 本任务自己的合并走 GitHub PR 按钮（不做 API merge）——以身作则

---

## 2. 写集（预期，实现时差异需回填）

| 文件 | 任务 |
|---|---|
| scripts/workflow/task-start.sh | 1 |
| tests/control-tower/task-start-parallel.test.sh | 1 |
| .github/workflows/ci.yml | 2 |
| scripts/control-tower/PLATFORM-CHECKLIST.md（新） | 3 |
| scripts/pre-commit-check.sh | 3（接线软检查） |
| .codex/control-tower/VERSION.md | 0.3（V5.0.1） |
| .codex/control-tower/version.log | 0.3 |
| docs/synova/coordination/版本管理规范-控制塔.md | 4 |
| task-state/D520.json | 回填 |
| memory/notes/implemented/（D520 Note） | D395-a 要求 |

**不碰**：scripts/audit/、src/（产品代码零改动）、electron/（L1 切片 A 另一线在做）、dsh/plugins/

## 3. 测试要求（铁律 0-2/48）

- 任务 1 测试（CRLF 回归）必须含 Windows 语义（可 CI 矩阵验证）
- 任务 3 接线测试（checklist 软检查触发）
- 全部沙箱 M13 合规
- 既有 5 个 CI 密封测试 + 本地全部 tests/control-tower/ 无回归（U7 会查配对）

## 4. 执行纪律（防拉扯）

### 开工
```bash
cd /Users/wane/SynovaAgent
git config core.bare false   # 环境自愈（历史事故残留可能为 true）
git fetch <https-url> main:refs/remotes/origin/main
git worktree add ../synova-wt-D520 -b feat/d520-platform origin/main
cd ../synova-wt-D520 && ln -sf /Users/wane/SynovaAgent/node_modules node_modules
```

### 提交（每批）
- 改完**立即 git add**；批完成 → `SYNO_GATEKEEPER_ACK=1 bash scripts/control-tower/synova-commit --task-id D520 --agent dsh-cto --message "..." --check` → 修 → 真提交
- brief 开头写全（六字段 + 全部写集进 Q2 + Done verify 含 `bash tests/...`）；message 多行 body 引用 `memory/notes/...`（D395-a）
- **版本纪律**：V5.0.1 条目 + version.log + 代码同 commit（§0.3）；合并后打 tag V5.0.1
- 网络断：API 只用于 push 传输（禁 merge）；merge 用 GitHub PR 按钮
- push 被对账拦：D451 补记一行（完整 40 位 hash）→ 再推，最多一轮

### 完成标准
- [ ] 任务 1-4 验收全绿（§1 每项 verify）
- [ ] V5.0.1 三同步（VERSION.md/version.log/tag）+ 与代码同 commit
- [ ] task-state/D520.json → impl_done + commit + files
- [ ] PR → CI 双平台绿 → 通知派单方 CTO 合并（合并权归 CTO）
- [ ] 交付报告（U4 声称↔证据，覆盖 DS 全部）+ 提 K3 审计

## 5. 并行冲突声明

| 线 | 状态 | 冲突 |
|---|---|---|
| D517-D519（L1 切片 A，dev-doc 线） | 刚派 | 不碰 scripts/control-tower/ 与 workflows/（D519 可能碰 electron/ 测试——与本任务零重叠）✅ |
| D511（版本守卫门禁，dev-doc 线） | claimed 进行中 | **与任务 3 都改 scripts/pre-commit-check.sh——冲突！** 执行前查 task-state/D511.json：若未合入 main，任务 3 的 pre-commit 接线**推迟到 D511 合并后**（或先做任务 1/2/4，任务 3 的 checklist 文件先建、接线最后加） |
| 审计/K3 | 被动 | 无 |

## 6. 完成通知

PR 合并后通知当前 CTO session（派单方）复核 + 派 K3 审计（切片级：D520 单任务一报告）。
审计通过后：Win 线并行隔离物理生效（CRLF 修）、平台问题不再等 Win 实测才发现（双 CI）、
新脚本平台差异被 checklist 拦截（防第四复发）。
