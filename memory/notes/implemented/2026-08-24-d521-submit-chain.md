# D521 控制塔提交链路收敛 — 决策与教训

> 状态: implemented | 日期: 2026-08-24 | 决策: 一个入口 + 三个不变量 + 两个工具 | 理由: 五病根同源——提交链路各阶段边界未定义

## 决策记录

1. **521-1 parser 剥壳对称**：brief_parser.parse_q2 的 include 段与 exclude 段同等剥壳（动词前缀 + 括号描述）。病根是剥壳规则不对称——exclude 剥、include 不剥 → D328 动词前缀误拦 + G12 全角括号误报同源。resolver 内嵌降级解析器同步修。
2. **521-1 tag 校验两段语义**：孤儿 tag（非 HEAD 祖先）= 与本次推送无关 → 跳过；HEAD 祖先 tag = 本分支产物 → 须为 origin/main 祖先（tag 只在 main 可达合法）。D319 配套：feature 推送无 tag = 合法中间态（§6 纪律要求合并后才打 tag——门禁必须配合纪律而非逼出孤儿 tag）。
3. **521-2 bypass 登记挪 hook 层**（后续批次详录）：COMMITTED 行在 commit 前由 pre-commit hook 统一写入——覆盖裸 git commit 与 synova-commit 两条路径，追加-后-commit 竞态从根消除。
4. **521-3 两工具**：CI 诊断通道文档化（::error 注解 + 匿名 annotations API）+ simulate-ci.sh（push 前本地 CI 等价模拟）。
5. **521-4 synova submit**：编排而非新门禁——五步（tag 检查→bypass 预防→--check→模拟→commit/push）各调现有脚本，只是顺序和时机正确。

## 执行中的教训（滚动记录）

- D319 与 §6 纪律的内在冲突必须同时修：纪律说"合并后才打 tag"，门禁却要求"push 前有 tag"——不修门禁，纪律就会被执行方用孤儿 tag 绕过（D520 的实证）。
- tag-ancestry 测试的 D319 隔离：场景设计要先把 VERSION.md 对应 tag 放到 main 上，否则 D319 先于 D331 拦截，测不到收窄语义。

## 执行中追加教训（521-3/521-4）

6. **hook 上下文导出 GIT_DIR 是沉默杀手**：`git commit` 的 hook 链（pre-commit→ct-test-gate→配对测试）里，测试沙箱的 `git -C` 不覆盖 GIT_DIR env → 沙箱提交直接落到宿主分支（ref 被覆写，reflog 可救）。治本 = 编排层 `env -u GIT_DIR -u GIT_WORK_TREE`；测试自带 unset 双保险。
7. **递归陷阱**：simulate-ci 的测试清单从 ci.yml 提取时必须排除自身——ct-test-gate 跑它 → 它跑 simulate-ci → simulate-ci 跑它 → 提交挂死 600s。凡"从清单跑测试"的工具，自排除是标配。
8. **D328 的 task-id 正则是 `\(D[0-9]+\)`**：message 写 "feat(D521-3)" 不匹配（声明=无）→ 提交被拦。批量提交 message 用纯 D 号、子任务号放正文。
9. **跨午夜长任务**：brief 文件名日期跨天后，resolver 的"今日 brief"失效 → CI strict 下"须有今日 brief"硬炸。长任务 brief 当天改名即可（rename 被 git 识别，历史干净）。
10. **simulate-ci 首日抓 4 真问题**：alloc 测试污染真实 brief 目录、brief 排除项无路径、跨午夜日期漂移、写集漏列——工具 2 的价值在第一轮就被自己证明。

## 事故级教训（本任务自伤记录，M15 冒烟终验的实际操作版）

11. **hook GIT_DIR 泄漏可毁树**：沙箱提交落宿主分支只是第一级；更狠的是 index 污染残留进后续提交 → 树静默丢失 492 文件 + 混入沙箱文件 + eol 幻影。**推 push 前必须跑 `git diff --stat origin/main...HEAD` 核对只含写集**——本次事故若早跑此一行，第一轮就能拦住。
12. **树手术的白名单必须按路径精确匹配**：writeset 过滤正则 `\.(sh|py)$` 漏掉无扩展名的 synova-commit → 被 checkout origin/main 误还原。教训：白名单用 `grep -vF -f 精确路径清单`，永不手写模式。
13. **`git add -A` 在 eol=lf 仓库是凶器**：会把 CRLF 幻影文件（working tree 被属性强制 LF）以真实修改卷进提交。本任务所有 add 必须显式路径。
14. **bypass 对账基必须恒为 origin/main**：分支 ref 为基时，merge main 后 main 新提交落入对账范围被误索登记——D508 merge-base 语义的前提就是 main 为基。
15. **污染恢复的标准动作**：reflog 找最后好点 → `git reset`（mixed，保工作区）→ 重建 index → 按精确写集恢复 → `git diff origin/main...HEAD` 终验清零 → 再提交。全程禁止 force push。
