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
