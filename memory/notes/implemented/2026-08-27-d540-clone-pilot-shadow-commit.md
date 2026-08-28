# D540 独立 clone 试点 + 影子提交 clone 环境验证 — 决策与教训

> 状态: implemented | 日期: 2026-08-27 | 任务: D540 | 决策: 隔离机制从 worktree 升格独立 clone + install-hooks 幂等 git 配置初始化（identity/quotepath/credential）+ verify-parallel 移 CI/PR + 删 post-merge-cleanup | 理由: M8 并行污染第四次复发（D320/D330/D331/D394→D506）+ 影子提交在 clone 环境因 git identity 缺失而降级（D537 #4 恢复后 L87「identity 未配置?」仍是风险路径）

## 决策记录

1. **独立 clone（治理定稿 v3 主方案，D507 §三 否决反转）**：独立 clone 相对 worktree 的优势 = 跨机隔离（远端单源化）+ 真·物理隔离（连 .git 对象库都不共享，断 M8 类共享 ref）。D507 反对理由（磁盘/hooks 漂移）用「flake 实测成本 + clone 后同批 install-hooks.sh 消除」兑现。编码任务一律 clone；主工作区=Codex 专用（单写者，复用 D539 `_assert_dev_worktree` 主树阻断）。
2. **不改 post-commit.sh / synova-commit（D530 二次覆盖风险）**：影子提交机制已恢复（D537 #4），本单只「验证 clone 环境照常 + 前置配置」，不改机制本体。改共享 hook 有 D530 覆盖 D521-2 的二次覆盖风险——本单把影子提交当验证对象，不当修改对象。
3. **clone 配置初始化放 install-hooks.sh（替代新脚本，零新组件）**：`_ensure_clone_git_config` 幂等初始化 `user.name=SYNO_GIT_NAME(默认 synova-mac)` / `user.email=claworg@users.noreply.github.com` / `core.quotepath=false` / `credential.helper=osxkeychain`。仅在 local 未设才写默认；已设不覆盖；配置失败 degraded 记录（铁律 11）不阻断 hooks 安装。env 可覆盖（测试注入缝 + 机器差异）。
4. **verify-parallel 移 CI/PR（缺口 2）**：本地 pre-push 门禁5 去 `--scan-today` 强阻断（单机多 session 语义不准）→ 软提示；CI quality job 加 `verify-parallel.sh --ci-pr origin/main`（base..HEAD 写集 × origin/main 已合写集比对，fetch-depth:0 已确认）。`--ci-pr` 模式用 `compare_writesets_ci`（**不做 V5.0.1 已完成任务豁免**——CI 要拦「本 PR 写集 vs 已合任务写集」重叠，豁免会让对比恒过，失去 CI 物理拦截意义）。
5. **删 post-merge-cleanup.sh（铁律 37）**：孤儿脚本（零生产调用，仅 loop-score/self-health 检查存在）。其职责（合并后扫残留）已被 影子提交 + union 合并 覆盖。删除后 loop-score 该项计 0（文件确已删，合理）。

## 执行中的教训（滚动记录）

- **`grep -q` 接管道在 `set -o pipefail` 下是非确定性元凶（SIGPIPE）**：`git log | grep -q pattern` 中 `grep -q` 匹配到第一行就**提前退出**，上游 `git log` 写剩余行时被 SIGPIPE 杀死（exit 141），`pipefail` 把 141 当失败 → 结论在「影子提交已生成」与「缺失」间随机摆动（实测 12 次跑 3 次误判）。修法：改用 `grep -c`（读全量，不提前退出，标准答案是 `| tr -d '\n\r' || true`——ctrl-tower 模式 4）。**断言真实性的物理断言（R 判据）在管道 + pipefail 下必须用 grep -c，禁 grep -q。**
- **git 无 identity 时「自动派生」身份（username@hostname），不是必降级**：本机无 global identity，`git commit` 会用 OS 用户名派生（实测 `白也 <wane@192.168.1.7>`）——所以 clone 无 identity 时影子提交**竟能成功**（用错误身份），不触发 L87。要真实触发 L87（`git commit` 因无法确定身份而失败），须 `user.useConfigOnly=true`（git 不再自动派生、只认显式身份配置）。**这是触发 post-commit L87「identity 未配置」路径的诚实物理条件**，测试用此建模。
- **install-hooks.sh 影子提交须在「已跟踪」的 bypass.log 上 append**：clone 沙箱里 bypass.log 未预 stage/跟踪时，`git status`/内层 `git commit`（post-commit.sh L84）行为不稳（实测非确定性影子提交缺失）。预创建 + 暂存 `.claude/bypass.log` 到 seed 提交后 10/10 稳定——post-commit.test.sh 同款可靠流程。
- **bundle 建独立 clone 的 ref 映射坑**：`git bundle create f origin/main` 生成 `refs/remotes/origin/main`，clone 后无 `refs/heads/*` → 报"empty repository"。须先建临时本地分支（`git branch -f _tmp origin/main`）再 `git bundle create f _tmp`，clone 后 `git reset --hard` 到该 ref。（网络 SSH clone 在本机吞吐瓶颈，改用本地 bundle 提速。）
