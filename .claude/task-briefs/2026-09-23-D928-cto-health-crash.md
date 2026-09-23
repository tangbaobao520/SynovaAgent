# Task Brief — D928 第③面生成器修复（gen-cto-health 崩溃 + verdict 误判）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

控制塔线（看板/度量基建），不动 src/** 产品代码。

- 触发：CTO 接手批自查——创始人「打开即真相」不成立；台账 2026-09-14 已记 P0（生成器自 D600 起无法生成）。
- 文件审计：`scripts/control-tower/gen-cto-health.py`:305（spec 假定 dict）/ :325-331（verdict 子串序）；配对测试三件已存在（gen-cto-health / -repro / -batch-report）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

参考：Anthropic/第一性原理 + 结论=**字段形态多态必须显式适配；裁决解析必须认"显式裁决"而非子串，歧义 fail-closed**。

- 台账 2026-09-14 记载两处 P0 与本次实测一致（崩溃 + FAIL 显示为 PASS）。
- 铁律 24/31：不可读/非预期形态 → 显式降级，不静默当真。

## Q2: 范围 — 正确的最简方案

做什么（逐条精确路径）：
- scripts/control-tower/gen-cto-health.py — ① spec 三形态适配（dict/短路径字符串/散文） ② 散文式 spec 不当路径（防 File name too long） ③ verdict 三步解析（显式裁决行 > 无歧义子串 > 歧义即 ?）
- task-state/D928.json、.claude/task-briefs/2026-09-23-D928-cto-health-crash.md、memory/notes/proposed/2026-09-23-cto-health-crash-fix.md

不做什么（含文件路径）：
- 不改 tests/control-tower/gen-cto-health.test.sh、tests/control-tower/gen-cto-health-repro.test.sh、tests/control-tower/gen-cto-health-batch-report.test.py（既有测试已能覆盖：修复后两个原红测试转绿即为判别性证据）
- 不改 scripts/audit/**（审计红线）、不改 src/ 产品代码

## 写集

| 文件 | 类别 |
|---|---|
| `scripts/control-tower/gen-cto-health.py` | task |
| `task-state/D928.json` | task |
| `.claude/task-briefs/2026-09-23-D928-cto-health-crash.md` | task |
| `memory/notes/proposed/2026-09-23-cto-health-crash-fix.md` | task |
| `.claude/bypass.log` | builtin（post-commit hook 运行期账本） |

## Q3: 验收 — 入口 → 交互 → 结果

入口：`python3 scripts/control-tower/gen-cto-health.py --dry-run`；三件配对测试
处理：三方形态 spec + 三种 verdict 文本
结果：exit 0（原崩溃）；gen-cto-health 与 -repro 由 FAIL → PASS（main 对照）

## 架构层

治理/CI（`scripts/control-tower`；不触五层依赖图）

## Done 标准

- [ ] `python3 scripts/control-tower/gen-cto-health.py --dry-run` 退出 0（原崩溃）
- [ ] `bash tests/control-tower/gen-cto-health.test.sh` 与 `bash tests/control-tower/gen-cto-health-repro.test.sh` 均 PASS（main 上均 FAIL，对照实测）
- [ ] 反例留证：散文式 spec 的卡（D911 等）不再触发 File name too long
