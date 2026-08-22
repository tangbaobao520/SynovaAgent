# memory/notes — Agent Notes 四态知识库

> D395-a（2026-08-17，K3 咨询 §4.2 拆分）——开发组织的决策可沉淀、可检索、不腐化（强化 M7 文档-实现漂移防线）。

## 四态目录（目录名即状态）

| 目录 | 状态 | 含义 |
|------|------|------|
| `proposed/` | proposed | 提议中的决策（尚未被采纳执行） |
| `implemented/` | implemented | 已落地执行的决策（当前生效） |
| `archived/` | archived | 已归档的历史决策（含旧 memory/ 教训文件） |
| `rejected/` | rejected | 已否决的决策（保留否决理由，防重蹈） |

**状态迁移 = `git mv` 换目录**（K3 §4.2 原文）。目录名即状态，头字段「状态」与所在目录一致，物理 grep 可对账，不靠解析文件内容。

```
git mv memory/notes/proposed/2026-08-17-xxx.md memory/notes/implemented/2026-08-17-xxx.md
```

## 迁移门禁（D472 — 物理，不靠自觉）

`scripts/control-tower/check-notes-lifecycle.sh` 在 pre-commit 组 6 区域扫描 `proposed/`：

- **僵尸判定**：提取 Note 的 D#（中文头 `任务: DXXX` / `相关 D#: DXXX`，或英文扩展头 `name:/class:/description:` 中的 `D\d+`）→ 若 `task-state/D#.json` 存在且状态 ∈ {`impl_done`, `spec_done`}（实现已落地）→ 判为**僵尸条目** → exit 1 阻断并列出清理清单。
- **放行**：无 D# 引用 / D# 未落地 / 无 task-state → 视为真实进行中提议，不阻断（不误杀）。
- **修复**：落地 → `git mv` 到 `implemented/` 并更新头「状态」；否决 → `rejected/`；测试残留 → 删除。
- 手动执行：`bash scripts/control-tower/check-notes-lifecycle.sh`（exit 0 = 无僵尸）。

## Note 四字段头契约（每条新 Note 必填）

```markdown
---
状态: proposed | implemented | archived | rejected
日期: YYYY-MM-DD
决策: <一句话决策>
理由: <为什么这样决策，可多行>
---

<正文：决策上下文 / 触发场景 / 相关 D# / 参考系>
```

- 「状态」字段必须与所在目录名一致（门禁可 grep 对账）。
- 文件名规范：`YYYY-MM-DD-<主题>.md`（主题用短横线分隔的英文/拼音）。
- **扩展字段**（`check-lessons-learned.sh` 写入，兼容免疫细胞解析）：`name/class/constraint/expected/severity/occurrences/first_seen/description`。四字段头 + 扩展字段同存一个 Note，头字段满足 README 契约，扩展字段供 hook 免疫机制消费（D472 对齐）。

## Note 引用门禁（物理，不靠自觉）

改 `scripts/control-tower/` 或 `src/orchestrator/` 的 commit，**commit message 必须引用 Note 路径**（`memory/notes/...`），且引用的 Note 文件真实存在——否则 `scripts/commit-msg-check.sh` 阻断（D395-a）。

> 落点：commit-msg hook（查 commit message），非 pre-commit 组 6（K3 §4.2 L219 + spec §4.5 决策 D）。

## 与旧 memory/ 的关系

- 旧 `memory/*.md` 20 个教训文件已 `git mv` 归档到 `archived/`，**正文不改**（保留可追溯）。
- 新决策不再平铺写 `memory/*.md`，一律走 `memory/notes/{四态}/`。
- `LOOP-ENGINEERING-CHANGELOG.md` 保留为历史决策流水，不迁移；新决策走 Note。
