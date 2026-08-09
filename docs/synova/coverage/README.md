# 仪表盘覆盖层 (D320) — 人工维护入口

## 一句话

`docs/synova/DASHBOARD-CN.md` / `DASHBOARD.md` 由 `scripts/control-tower/gen-task-board.py` 渲染。
**人工只改两处**：本目录的 `board-override.yaml` + DASHBOARD 的 MANUAL 区（marker 之间）。
AUTO 区（marker 之间）是 git/文件派生事实 — 手写修改会在下次运行被覆盖。

## 数据流

```
git log (D#) ─┐
dev docs 头 ──┼─→ gen-task-board.py ─→ DASHBOARD-CN.md / DASHBOARD.md
briefs ───────┤     (只读, 幂等写回)     ├─ AUTO:START → AUTO:END  (git 派生, 禁止手写)
VERSION/CI ───┤                          └─ MANUAL:START → MANUAL:END (原样保留)
board-override ┘
```

## 修改任务事实的正确姿势

| 场景 | 做法 |
|------|------|
| 任务状态/优先级 | 改 dev doc 头部注释（`状态: dev doc \| 日期 \| 优先级 P#`）→ 重跑生成器 |
| git 无法表达的事实（受阻/决策/待办） | 编辑 `board-override.yaml`（语法见文件头注释）→ 重跑生成器 |
| 自由格式内容（恢复区/备注/说明） | 编辑 DASHBOARD 的 MANUAL 区 → 生成器逐字节保留 |

## 运行

```bash
python scripts/control-tower/gen-task-board.py            # CN + EN
python scripts/control-tower/gen-task-board.py --lang cn  # 仅 CN
python scripts/control-tower/gen-task-board.py --dry-run  # 只计算不写
```

幂等：自动区无变化 → 不写文件（mtime 不变）。数据源缺失 → 视图中 degraded 标注（D296，禁止假 0/假绿）。

## 关联

- 权威设计: `docs/plans/codex/implementation/SYNOVA-IMPL-D320-仪表盘git化生成器-20260808.md`
- 生成器: `scripts/control-tower/gen-task-board.py`
- 测试: `tests/control-tower/gen-task-board.test.py`（10 用例：D# 提取/推送状态/MANUAL 保留/幂等/CI degraded/空历史/override/dev doc 头）
- 后续: D321 git notes 读取（生成器已留 hook 点）；D323 双机同步健康
