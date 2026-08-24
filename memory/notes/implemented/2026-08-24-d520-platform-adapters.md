# D520 跨平台适配收口 — 执行教训

> 提取自: D520 四任务执行（spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D520-platform-adapters-20260824.md）
> 主题: CRLF 病根 / 双平台 CI / checklist 物理化 / 冒烟终验实战首例

## 决策与教训

1. **CRLF 病根双杀**：task-start 的 `tr -d '\n'`（D515 原版）本就漏 `\r`；main 合并又把该行 mangle 成字面双 LF（引号内真实换行——bash 语法仍合法所以静默存活）。修法 = `tr -d '\r\n'` + `${VAR//[^0-9]/}` 双步清洗。**凡命令输出进 `[[ -gt ]]` 算术前，双步清洗是标配**（已入 PLATFORM-CHECKLIST §2）。
2. **冒烟终验首例立功（M15 当天立当天用）**：核对 D520 写集时发现 main 的 pre-commit-check.sh 只有 772 行——d3e63e8f"D516 去重 690 行"把组 6.5-13 + 结果判定整体误删（G12d/G13 质量根特例消失、脚本无 exit 静默 fail-open、CI 照样绿）。重建 = 8cdf9957 完整版为基座 + 移植 SYNO_CI strict 演化。**教训：大额"去重"commit 必须附 `wc -l` 前后对照 + 组结构清单核验。**
3. **D515 补丁重放瑕疵（三重定义根因）**：补丁脚本断点后重跑时，插入型 patch（new ⊃ old）的幂等判断 `new in s and old not in s` 永假 → 重复插入。bash 取最后定义所以行为正确、测试全绿——但给后续"去重"埋了雷。**教训：插入型 patch 的幂等哨兵必须用独立标记注释，不能用 old/new 包含关系。**
4. **双平台 CI 是平台 bug 的唯一系统性防线**：CRLF 空转 3 次复发都是"等 Win 实测暴露"。矩阵 `os: [ubuntu, windows]` + `shell: bash` + 密封测试 10 个，平台问题在 PR 上即时红。
5. **checklist 要物理接线才有牙**：PLATFORM-CHECKLIST.md 单独存在 = 文档（V3.9 教训：信息注入型检查对 agent 不可见）。接线 pre-commit 软检查（新脚本含裸平台命令 → 点名 checklist；SYNO_CI=1 转硬）后才是门禁。
6. **测试断言 grep 陷阱两则**：① `grep "tr -d '\r\n'"` 中 `\r` 被 grep 当转义吃掉 → 用 `-F`；② "文件名被点名"断言会误捕 G12 范围提示 → 断言必须限定在目标检查的输出行（`grep -A1 "平台敏感命令"`）。

## 执行中追加教训（CI 双平台调参过程）

7. **sed -i 是第 9 个平台坑（当场踩中）**：q2 测试用 BSD 语法 `sed -i ''`，GNU sed（Linux/Git Bash runner）把 `''` 当脚本、替换静默不生效——本地 mac 全绿、双平台 CI 全红。已沉淀 checklist 第 9 条；跨平台文件替换一律 python。
8. **CI 失败无日志时的注解通道**：本机无 gh/token 拉不了日志 → 临时给 job 加 `::error title=..::消息` workflow command，失败输出经 check-runs annotations 匿名 API 可读——两次定位（q2/G12）全靠它。用完即撤。
9. **CI strict 的语义边界**：`SYNO_CI=1` 把一切 warn 转硬会误炸"可选"类提示（PRD 章节引用）→ 新增 `opt_check()`（永不转硬）。质量类才配 CI 权威。
10. **brief 写集裸路径 + 全覆盖**：全角括号注释附着路径（`xxx.sh（说明）`）让 brief_parser 提取不匹配 → G12 误报"不在范围"（本地软提示不可见，CI strict 才暴露）；且写集漏列一个实际修改的文件同样被 G12 抓住——两次都是真问题。
11. **版本号撞车处置**：spec 定 V5.0.1 但推送时发现 Win 线已用（remote tag 指向他人提交、D331 锚点拦截）→ 顺延 V5.0.2 并在 VERSION.md 注明。孤儿 tag（V4.7.1 本地残留）会被 fetch 反复带回，push 前需再清。
