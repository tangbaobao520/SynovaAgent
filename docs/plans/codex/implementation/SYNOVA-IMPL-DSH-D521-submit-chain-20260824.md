<!-- SYNOVA-IMPL-DSH-D521: 控制塔提交链路收敛（治本） -->
<!--
  状态: dev doc 完整版（自包含，执行方零上下文可执行）
  作者: 当前 CTO session (dsh-cto) | 2026-08-24
  执行方: 并行 CTO session（创始人指定——对控制塔语义最熟，且 D520 复盘即出自你手）
  优先级: P0 | 版本编排: V5.0.2 → V5.1.0（MINOR：提交链路契约收敛，新机制）
  上游: D520 执行方时间复盘（自己诊断出三贵坑）+ Win 台账三登记 + CTO 全链路代码核实
-->

# D521: 控制塔提交链路收敛（治本，非头痛医头）

> 一句话：控制塔的反复拉扯不是"门禁太多"，是**"提交"这个连续动作被拆成 N 个独立脚本、
> 脚本间契约未收敛**——tag 时机、bypass 竞态、语义 parser、CI 诊断、push 模拟五个病根
> 是同一类问题的五种表现。本任务把它们收敛成一个自洽契约 + 一个统一提交入口。

---

## 0. 病根诊断（为什么是"治本"而非"修五个坑"）

### 0.1 五个病根的共性

| # | 病根 | 代码级实证（CTO 核实） | 共性 |
|---|---|---|---|
| 1 | **tag 时机无物理强制** | pre-push-check.sh L176 `git tag -l 'V*'` 遍历**所有本地 tag** 且 `--is-ancestor "$t" HEAD`——孤儿 tag（在未合并分支打的）拦死**其他一切分支**推送 | 校验范围错（该查"main 可达 tag"却查了"HEAD 可达 tag"） |
| 2 | **bypass.log 追加竞态** | D508 把登记提前到 commit 成功瞬间（synova-commit L667），但**只在 synova-commit 路径**——裸 `git commit`（hook 层）没有 → 文件永脏 → 挡 merge → 逼裸 git → 对账失败 → D451 补记循环 | 追加时机错（该在 commit 前，实际在 commit 后且只覆盖一条路径） |
| 3 | **语义 parser 未统一剥壳** | brief_parser.py `parse_q2`：**include 段不剥动词前缀**（"改 src/x"）、**include 段不剥全角括号**（"src/x（描述）"）→ 认领失效 → D328 动词前缀误拦 + G12 全角括号误报 | 剥壳规则不对称（exclude 段剥、include 段不剥） |
| 4 | **无 CI 日志通道** | 本地无 gh CLI/token 时 CI 红只能盲猜（D520 复盘：白等 30 分钟） | 缺工具（::error 注解通道可解，未文档化） |
| 5 | **push 前无 CI 等价模拟** | 无脚本（只有 check-ci-stale-red.sh 查 CI 红不红，非本地模拟） | 缺工具（GITHUB_ACTIONS=true SYNO_CI=1 本地跑，本地能抓的错送上 CI 白等） |

**共性一句话**：五个坑都源于"提交链路各阶段的边界条件没定义清楚、没物理强制、没统一入口"。逐个修 = 头痛医头（D503/D506/D513/D520 已经这么修了五轮，坑还在以新形态复发）。治本 = 定义**提交链路契约**，让五个阶段各自有且仅有一个物理强制点。

### 0.2 已有的地基（不要重造，D508/D513/D516/D520 已建）

- `synova-commit --check` 全量 dry-run（D508）
- SYNO_CI strict 模式（D516：本地软 + CI 硬）
- 双平台 CI 矩阵（D520）+ PLATFORM-CHECKLIST.md（D520）
- API 禁 merge 纪律（D520 版本规范 §六）+ 冒烟终验清单
- COMMITTED 登记提前（D508，但只 synova-commit 路径——本任务补 hook 层）

---

## 1. 治本目标：一个入口 + 三个不变量 + 两个工具

### 目标 1（核心）：`synova submit` —— 统一提交入口

把现在分散的"`--check` + pre-commit + pre-push 对账 + tag 校验 + 模拟"收敛成**一条命令**：

```
synova submit --task-id D# --agent X --message "..." [--files ...]
  内部依次：
  ① tag 时机检查（本地 tag 是否 main 可达，孤儿 tag 提前警告而非 push 时拦）
  ② bypass 竞态预防（COMMITTED 行在 commit 前写入）
  ③ 全部门禁 dry-run（--check 语义，一次报全）
  ④ CI 等价模拟（GITHUB_ACTIONS=true SYNO_CI=1 本地跑，本地能抓的错不送 CI）
  ⑤ git commit（走 hook，hook 层的 bypass 竞态已由不变量 2 根治）
  ⑥ push + 失败诊断（::error 注解通道读 CI 失败，不再盲猜）
```

**不是新增第六个脚本，是把五个阶段编排进一个入口**——每个阶段调用现有的 check 脚本，只是顺序和时机正确了。执行方 D520 复盘里的"如果重来一遍"，就是本目标的操作化。

### 目标 2：三个物理不变量（治本的核心，非新门禁）

#### 不变量 1：tag 只在 main 可达时合法

- **改**：pre-push-check.sh `check_tag_ancestry`——把 `--is-ancestor "$t" HEAD` 改为 `--is-ancestor "$t" origin/main`（tag 校验范围收窄到 main 可达 tag；本地分支打孤儿 tag 不再拦其他分支推送，但**main 上缺失的 tag 仍会拦**——保持 D319 语义）
- **加**：`synova submit` 第①步——本地有孤儿 tag（`git tag -l 'V*'` 且非 origin/main 祖先）时**提前黄色警告**（"此 tag 未在 main 上，push 会被拦，建议删除或等合并后重打"），而不是让用户 push 时撞 D331 盲猜
- **验收**：孤儿 tag 场景——push 其他分支不再被 V 系列孤儿 tag 拦（只 main 缺失 tag 才拦）

#### 不变量 2：bypass.log COMMITTED 在 commit 前写入

- **改**：把登记时机从"synova-commit 的 commit 成功后"统一到 **pre-commit hook 层**（`.git/hooks/pre-commit` 或 pre-commit-check.sh 末尾）：任何 `git commit`（含裸 git commit、含 synova-commit）在提交**前**就把当前 HEAD 的 COMMITTED 行写入 bypass.log 并 add 进本次提交
- **效果**：提交后 bypass.log 永远干净（无脏文件挡 merge），D451 补记循环从根消除
- **验收**：裸 `git commit`（不经 synova-commit）后，bypass.log 无未提交脏变更 + 含本次 HASH 记录

#### 不变量 3：语义 parser 统一剥壳（include/exclude 对称）

- **改**：brief_parser.py `parse_q2`——**include 段也剥动词前缀**（"改/修改/新增" 等，与 exclude 段的"不改/不修改"对称）+ **include 段也剥括号描述**（"src/x（描述）"→"src/x"）+ 剥后置分隔（`: ` `：` ` — `）
- **配套**：resolve-commit-brief.sh 内嵌的同款解析器同步（D328 动词前缀误拦的根）
- **验收**：Q2 include 写「改 src/xx.ts（说明）」→ parser 提取出裸路径 `src/xx.ts` → 认领生效（不再撞旧 brief）

### 目标 3：两个工具（消 D520 复盘的两大等待）

#### 工具 1：CI 失败日志通道（::error 注解）

- **文档化**：`docs/synova/coordination/CI-诊断通道.md`——本地无 token 时如何用匿名 GitHub API 读 check-runs annotations（::error 输出）定位 CI 失败，附 curl 命令模板
- **加**：pre-commit-check.sh / 各 gate 脚本的失败输出统一用 `##[error]` 或 `::error::` 前缀（GitHub 自动进 annotations）
- **验收**：构造一个 CI 失败，无 token 也能通过 annotations 读到失败具体行

#### 工具 2：push 前 CI 等价模拟脚本

- **新建**：`scripts/control-tower/simulate-ci.sh`——在干净临时目录跑 `GITHUB_ACTIONS=true SYNO_CI=1 SYNO_DIFF_BASE=origin/main bash pre-commit-check.sh` + 关键 gate 脚本，输出与 CI 一致的失败报告
- **接入**：`synova submit` 第④步调用；也可独立跑（`bash scripts/control-tower/simulate-ci.sh`）
- **验收**：本地模拟能抓到"本地全绿但 CI 红"的环境差异类错误（GNU sed/autocrlf/fetch-depth 类）

---

## 2. 任务拆分（按依赖，D521 一个任务但可分批提交）

| 子任务 | 内容 | 依赖 | 版本 |
|---|---|---|---|
| 521-1 | 不变量 3（parser 剥壳）+ 不变量 1（tag 收窄）——两个纯改现有脚本 | 无 | V5.0.3 |
| 521-2 | 不变量 2（bypass commit 前写入，hook 层） | 无 | V5.0.4 |
| 521-3 | 工具 1（::error 通道）+ 工具 2（simulate-ci.sh） | 无 | V5.0.5 |
| 521-4 | `synova submit` 统一入口（编排前五步） | 521-1/2/3 完成后 | **V5.1.0（MINOR）** |

> 每个子任务独立 commit + 独立 PATCH bump，最后 521-4 打 V5.1.0（MINOR：新入口是新机制）。**每次涉及控制塔行为变更的 commit 必须带对应 bump**（创始人点名纪律）。

---

## 3. 写集（预期，实现差异回填）

| 文件 | 子任务 |
|---|---|
| scripts/pre-push-check.sh（check_tag_ancestry） | 521-1 |
| scripts/control-tower/brief_parser.py + scripts/workflow/resolve-commit-brief.sh（内嵌解析器） | 521-1 |
| scripts/pre-commit-check.sh（末尾 bypass 预登记）+ .git/hooks/pre-commit（或 install-hooks.sh 生成逻辑） | 521-2 |
| scripts/control-tower/synova-commit（register 挪 hook 后去重） | 521-2 |
| docs/synova/coordination/CI-诊断通道.md（新） | 521-3 |
| 各 gate 脚本失败输出加 ::error 前缀 | 521-3 |
| scripts/control-tower/simulate-ci.sh（新） | 521-3 |
| scripts/control-tower/synova-submit.sh（新，或 synova-commit 扩展 submit 模式） | 521-4 |
| tests/control-tower/*.test.sh（配对，见 §4） | 全部 |
| .codex/control-tower/VERSION.md + version.log | 全部（§0 版本纪律） |
| task-state/D521.json + memory/notes/implemented/ | 全部 |

**不碰**：scripts/audit/（K3 红线）、src/（产品代码）、electron/（L1 切片 A 另一线）

---

## 4. 测试要求（铁律 0-2/48，先 red 后 green）

| 子任务 | 配对测试 | 断言 |
|---|---|---|
| 521-1 | tag-ancestry.test.sh（新）+ brief-parser-strip.test.sh（新） | 孤儿 tag 不拦其他分支 push / include 段剥「改」「（）」后提取裸路径 |
| 521-2 | bypass-precommit.test.sh（新） | 裸 git commit 后 bypass 干净 + 含 HASH |
| 521-3 | simulate-ci.test.sh（新） | 本地模拟能复现 CI 环境差异错误 |
| 521-4 | synova-submit.test.sh（新） | submit 五步编排顺序正确（tag 检查在 commit 前等） |

- 全部沙箱 M13 合规（git -c + GIT_DIR）
- 既有 tests/control-tower/ 全量无回归（U7 会查配对）
- 双平台 CI（D520 已建矩阵）——**新测试都要进 CI**（D520 的教训）

---

## 5. 执行纪律（执行方 D520 复盘自己的话，落成规范）

1. **开工先确认 CI 日志通道**——本地无 token 就用 ::error 注解（本任务工具 1 就在建它，先自己用上）
2. **每次 push 前跑 simulate-ci**——本地能抓的错不送 CI（本任务工具 2 就在建它）
3. **brief 写集第一步抄 spec §3 的表**，裸路径格式（本任务不变量 3 就在修 parser，先手工裸路径）
4. **第一次撞 bypass 竞态就修根因**（本任务不变量 2 就在修），不 D451 补记绕
5. **rebase reword 失败一次 → 立刻 soft-reset squash**，不试第二种编辑器方案
6. 全程专属 worktree；文件改完立即 git add；--check 一次看全再真提交
7. **M15 纪律**：API 只传输禁 merge；树写入后冒烟终验（`git diff <已知好commit>..HEAD --stat`）

---

## 6. 版本编排（创始人点名纪律，加粗）

**V5.0.2 → V5.0.3（521-1）→ V5.0.4（521-2）→ V5.0.5（521-3）→ V5.1.0（521-4）**

每个子任务：
1. VERSION.md 顶部插入对应版本条目（变更明细/验证/作者，格式对齐 V5.0.0）
2. version.log 追加 JSON 行
3. **bump 与代码同 commit**
4. **tag 在 PR 合并 main 后打**（`git tag V5.0.3 && git push origin V5.0.3`）——**绝不在未合并分支打**（本任务不变量 1 修的正是这个坑，执行时自己先遵守）

---

## 7. 并行冲突声明

| 线 | 状态 | 冲突 |
|---|---|---|
| D511（版本守卫，dev-doc 线） | claimed 进行中 | 与 521-1 都改 pre-commit/pre-push——**执行前查 D511 状态**，若未合并，521-1 的 tag 收窄等 D511 后重放；或与 D511 执行方协调 |
| D517-D519（L1 切片 A） | 刚派 dev-doc | 不碰 scripts/control-tower 与 workflows（D519 碰 electron/）✅ 零冲突 |
| K3 审计 | 被动 | D521 完成后切片级审计（单任务一报告） |

---

## 8. 完成标准

- [ ] 四个子任务验收全绿（§1 每个 verify + §4 测试）
- [ ] V5.1.0 三同步（VERSION.md/version.log/tag）且 tag 在 main 上
- [ ] 双平台 CI 全绿（D520 矩阵）
- [ ] task-state/D521.json → impl_done + commit + files
- [ ] PR → CTO 合并（走 PR 按钮，M15 以身作则）→ 通知派单方复核 + 派 K3 审计
- [ ] **验收的最终试金石**：一个真实的"修复类"小任务，从开工到合并 ≤ 30 分钟（D520 是 2 小时，本任务治本后应回到 30 分钟级）

## 9. 完成通知

PR 合并后通知当前 CTO session（派单方）用下一个真实小任务实测 §8 的试金石——若仍 >30 分钟，CTO 再排查剩余欠账（而非让执行方背锅）。
