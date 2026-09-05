# D554 — post-commit 影子提交路径限定（CT-43 修复）

> 状态: implemented | 2026-08-28 | by: dsh-cto | 关联: CT-43 / D552 / V5.2.3

## 决策

post-commit hook 的「bypass COMMITTED 登记」影子提交必须限定路径（`git commit -o -m ... -- "$ROOT/.claude/bypass.log"`），只提交登记文件本身。

## 背景

D552 实证（8b6deaf4）：D311 staging-guard 阻断后遗留的 staged 文件（dsh/plugins 插件 8 文件）被影子提交整体卷入「bypass 登记」提交——消息与内容不符，M8/D286 同型变体。防线缺口 = 影子提交无 pathspec 限定。

## 实现要点

- `-o`（--only）：命名路径的工作区快照建临时索引提交，不消费 index 其余内容，遗留文件保持 staged
- **参数顺序**：`-m` 必须在 `--` 之前（-- 之后全部按 pathspec 解析）——首版实现踩坑，测试抓到
- 测试扩展 post-commit.test.sh 7→12 断言（场景D 遗留文件不卷入 + 接线 + 降级）；连带修 M5 环境依赖（沙箱自配 git identity）

## 教训沉淀

- 影子/自动提交类代码路径必须显式 pathspec——「登记提交」不意味着「提交全暂存区」
- 控制塔脚本的 `-o`/`--` 参数顺序是易错点，测试必须跑真实 git 命令（非 mock）
