# Plan: task-state 状态「工件自动派生」改造（D393）

> 状态: 草稿待创始人审 | 2026-08-16 | 决策参考：DeepSeek 第一性原理（状态=可重演事实）+ Anthropic（机器可验契约）+ 开源实证（GitHub/Linear 状态=事件派生，不人工维护）——三参考系收敛

## 一、目标

**消除人工维护 task-state status → 生成器每次运行从工件自动派生**。解决已实证的失真问题（D385-D392 我提交后忘了更新，编码线 D356/D379 同样）。

打开仪表盘 = 从当前 git/文件系统重演真相，永不失真。

## 二、派生逻辑（每个状态从什么物理工件算）

| 状态 | 工件来源 | 判定 |
|---|---|---|
| **spec** ✅ | `docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D#-*.md` 或 json spec.path 指向的文件 | 文件存在 |
| **impl** ✅ | git log（含该 D# 的提交）或 json impl.commit 是某 ref 祖先 | 有提交 |
| **audit** | `docs/synova/audit-reports/*D#*.md` 解析 verdict（PASS / CONDITIONAL PASS / FAIL） | 文件存在 + 解析 |
| **status** | spec/impl/audit 组合：全空→claimed；spec→spec_done；+impl→impl_done；+audit→audited | 组合规则 |
| **FIX** | json fix_task_id（保留人工，审计闭环指向） | — |

**人工输入最小化**：task-state/*.json 只保留「生成器读不到的元数据」（标题/备注/审计报告路径/fix_task_id），status/spec/impl/audit 字段由生成器每次覆盖。

## 三、改动文件

| 文件 | 改动 |
|---|---|
| `scripts/control-tower/gen-cto-health.py` | analyze_task_state 重构：派生逻辑（扫 dev doc/审计报告 + git log）替代读 json.status |
| `tests/control-tower/gen-cto-health.test.sh` | 补派生测试（spec 存在/impl 提交/audit 报告 → 状态正确；删 json.status 仍对） |
| `task-state/README.md` | 状态机语义更新：status = 派生字段（生成器覆盖），json = 元数据层 |
| `task-state/*.json` | 批量清理：移除 status/spec/impl/audit 人工字段（或标记 deprecated，生成器忽略） |

## 四、验收标准

1. `python3 gen-cto-health.py` 跑出 D385-D392 = impl_done（不再 claimed，无需人工更新）
2. 删掉任意 json 的 status 字段 → 生成器仍输出正确状态（证明派生）
3. `tests/control-tower/gen-cto-health.test.sh` 全绿（含新派生用例）
4. 幂等（数据源指纹未变不写）保持

## 五、风险与边界

| 风险 | 对策 |
|---|---|
| git log --grep D# 误报（提交信息含 D# 但非本任务） | 优先用 json impl.commit 精确判定；无 commit 时回退 git log --grep 该 D#（精确 `(D#)` 格式） |
| 审计报告 verdict 解析依赖格式 | 正则 `CONDITIONAL PASS\|PASS\|FAIL`，解析失败标 degraded 不伪造 |
| git log 全历史性能 | 单次 `git log --all --format=%s` 缓存于进程内，45 任务级查询内存匹配 |
| 历史 task-state 有 status 但工件已删（如 spec 移动） | 派生优先于 json 字段；json 字段仅当工件缺失时作兜底展示（标注 degraded） |

## 六、实施步骤

1. 改 analyze_task_state（派生逻辑 + 组合规则）
2. 跑生成器对比现有状态（应自动纠正失真项）
3. 补测试（派生用例 + 删 status 字段验证）
4. 更新 task-state/README.md 语义
5. 批量清理 json 人工 status 字段（提交时）
6. 全量验证（幂等 + 测试 + pre-commit 自过）
7. 提交（分配器取号 D393）+ 推送

## 七、参考系记录（可核）

- 参考：DeepSeek/第一性原理（状态必须可重演）+ Anthropic（机器可验契约）+ 开源实证（GitHub Projects/Linear 状态=事件派生）——收敛
