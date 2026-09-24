# 决策 Note — B5-U6 `spec` 形态统一 + 消费者对 string 显式降级

- 状态: proposed（待 K3 审 + CTO 收件闸后 `git mv` 到 implemented/）
- 责任方: b5-c1（B5-U6 返修）｜ 队长: synova-squad-lead
- 触发: CTO 2026-09-24 裁定「U6 本卡内做，不另立卡」（task-10）

## 决策

1. **`task-state/*.json` 的 `spec` 规范形 = `{"path": "<相对路径>"}`**（单一语义、机器可读）。
   本次归一 4 张卡：`D928`、`D933`（原 dict 5 键/4 键 → 仅 `path`，其余键原样搬到同级 `spec_meta`）、
   `D934`、`D936`（原 string → `{"path": …}`）。**零信息丢失**（逐字比对，见证据件 §二.3）。
2. **消费者 `scripts/control-tower/gen-cto-health.py` 对非规范形显式降级**（不崩溃、不静默）：
   `isinstance(spec, str)` → `⚠ degraded:` 到 stderr（含卡号）+ **报告正文可见块**（要求③：不得只写 stderr）；
   **向后兼容**：形如单一路径的 string **仍按路径使用**；散文/多路径/`§`节引用**不得当路径**；
   其他类型同样显式降级。判据 = `_SPEC_PATH_RE`（单 token + 已知扩展名）+ 长度上限 512。
3. **不批量归一**其余 116 张 string 卡（后续卡）；本卡只保证生成器能跑通且降级可见。

## 依据（可核，2026-09-24 实测）

- **崩溃实锤（改前）**：`python3 scripts/control-tower/gen-cto-health.py --dry-run` → `exit=1`、**stdout 0 行**、
  `AttributeError: 'str' object has no attribute 'get'` @ `gen-cto-health.py:305`（异常穿 `main():563` → `:613` 退出）。
  305 行**不在任何 `try` 内**（包围的 try 只到 `json.loads`，`:292–296`）⇒ 是**致命崩溃**，不是"被 except 吞掉的静默"。
- **影响面**：`task-state` 全量 `spec` 形态 = `dict 81 ｜ NoneType 159 ｜ str 118`（基线 `9f0c8f65`）
  ⇒ 循环无条件取 `spec.path`，遇第一个 string 即抛 ⇒ **main 上该生成器跑不完**，`docs/synova/CTO-HEALTH.md` 无法再生。
- **调用侧"看不见"的真出处**：`scripts/control-tower/pre-audit-summary.sh:74` `python3 - … >/dev/null 2>&1` 丢弃 stderr
  ⇒ U3-artifact-repro 门只留"未过"、丢失可归因性（记为 U12，不在本卡写集）。
- **上游同源修复**：D928（PR #725，**未合并**）同处加 `isinstance(_spec, str)` 处理与「形如路径」守卫；
  本卡的 `_SPEC_PATH_RE` 与其口径一致，合并时按 add/add 处理、不冲突。
- **测试承重**：变异树 `git worktree add --detach /tmp/u6-mut 9f0c8f65`（旧实现）+ 同探针输入 → `rc=1`/0 行 ⇒
  新增第 6 节断言 ②③④⑥ 全红；**⑤ 初版是否定式断言，在空输出下会"空过变绿"**，已加"行存在性"前置修正。

## 边界（本决策**不**覆盖）

- 不改 `pre-audit-summary.sh`（U12，属控制塔域，lead 裁「暂不纳入」）；不改 `ci.yml`、`alloc-task-id.sh`、`scripts/audit/**`。
- 不解决"散文 spec 里含可用路径"的抽取（如 `…md §一`）—— 本卡保守取 `path=None`，避免误判；是否抽首个 token 待 CTO 定。
- 不更新生成物 `docs/synova/CTO-HEALTH.md`（不在写集；测试副产物已还原）。

## 预期后续

- 其余 116 张 string 卡归一（新卡）；U12 归因修复（新卡或并入控制塔域）。
- 形态归一后 `spec` 只有一种读法，`_extract_spec_path` 的兼容分支可降级为"仅告警"再移除（保留至归一完成）。
