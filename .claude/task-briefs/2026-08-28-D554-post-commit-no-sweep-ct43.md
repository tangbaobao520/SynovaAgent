# Task Brief: D554 post-commit-no-sweep-ct43

> 生成: 2026-08-28 | 任务: D554 | 认领: CTO (DeepSeek Harness)
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 决策参考：第一性原理（影子提交只需登记 bypass.log，与暂存区其余内容无关——最小写集原则）+ 开源实证（git commit -o 语义：命名路径工作区快照，不消费 index）+ 收敛结论：一行命令限定 + 配对测试扩展，零新机制

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔 hook 层（scripts/hooks/post-commit.sh，D521/不变量2 的「bypass COMMITTED 登记」影子提交段）。
D552 实证（8b6deaf4）：D311 guard 阻断后遗留的 staged 文件被影子提交整体卷入——登记提交未限定路径。

### b) 文件审计
- `scripts/hooks/post-commit.sh` L84：`git add bypass.log && git commit --no-verify -q -m ...`（无 pathspec → 卷走全暂存区）
- `tests/control-tower/post-commit.test.sh`：现有 7 断言（D521-2 三路径 + 接线），无「遗留文件」场景；已在 CI 密封清单（ci.yml L148）
- `.codex/control-tower/VERSION.md`：当前 V5.2.2 → bump V5.2.3（PATCH：bug 修复）
- 版本管理规范-控制塔.md §一/§三：bump 同 commit + 合并 main 后打 tag（D319 时机契约：feature 分支无 tag 合法）

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 铁律 0-2 接线验收：修复后必须测试真实路径（-o 参数顺序实测：-m 在 -- 之后会被当 pathspec——首版实现即踩，测试抓到）
- 铁律 48 测试非空壳：扩展既有配对测试（7→12 断言），正常/边界/降级 + 接线
- M5 环境依赖门禁：测试沙箱需自配 git identity（本机无全局 identity 时影子提交必败——机器无关化）
- M8/D286 共享暂存区竞争：本次修复的目标模式
- ctrl-tower-change 模式 1/5/6：三态退出不变、测试注入、改完验收链（bash -n → 测试 → pre-commit）

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/hooks/post-commit.sh：登记提交加 `-o -m "..." -- "$ROOT/.claude/bypass.log"`（-m 在 -- 前）
- tests/control-tower/post-commit.test.sh：+场景D（遗留文件不卷入）+接线断言+降级，沙箱配 identity
- .codex/control-tower/VERSION.md：V5.2.3 条目（同 commit，tag 在 main 合并后打）

不做什么：
- 不改 scripts/hooks/post-commit.sh 的 bypass 三判段（L16-60）与 marker 对账（L61-77）— 修复面外
- 不改 scripts/control-tower/synova-commit — D508 去重已正确，零触碰
- 不改 scripts/control-tower/check-bypass-log.sh — 对账逻辑不动
- 不改 scripts/audit/**.py — K3 红线
- 不新增 scripts/** 其他文件 — 防膨胀（PATCH 不加机制）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：任何 commit（裸 git / synova-commit）→ post-commit hook 影子登记
处理（中间步骤）：-o 限定路径提交 → 只含 bypass.log 的影子提交，暂存区遗留文件保持 staged
结果（最终展示）：`git show HEAD --name-only` = 仅 .claude/bypass.log；遗留文件仍在暂存区

## 架构层: 控制体系

scripts/hooks/ + tests/control-tower/（控制塔 hook 层，非 L1-L5 产品层）

## Done 标准: 以下全部物理可验

- [x] verify: bash tests/control-tower/post-commit.test.sh —— 12/12 全绿（含场景D 三断言 + 接线断言）
- [x] verify: bash -n scripts/hooks/post-commit.sh —— 语法零错误
- [x] verify: git diff origin/main -- scripts/hooks/post-commit.sh | grep -c '^[+-]' —— 只改登记提交一处命令（+ 注释），无旁路改动
- [x] verify: git ls-tree --name-only origin/main .codex/control-tower/VERSION.md —— PR 合并后 V5.2.3 条目在 main
- [x] verify: git tag -l V5.2.3 && git ls-remote --tags origin V5.2.3 —— main 合并后 tag 落位（D319 三处同步）
- [x] verify: CI check-runs 全绿（post-commit.test.sh 在双平台 canary 密封清单内）
