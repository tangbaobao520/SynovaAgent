---
状态: implemented
日期: 2026-08-22
决策: Notes 四态生命周期补闭环 — 注入过滤 + 迁移门禁 + 字段契约对齐
理由: D395-a 建好四态目录后生命周期是断的：hook 读全目录导致 archived 教训注入噪音；proposed→implemented 迁移靠自觉导致僵尸条目；lessons 头字段与 README 契约分裂。补三处闭环：hook 只读活态（proposed+implemented）、迁移门禁物理拦截僵尸、字段契约统一。
---

## 决策上下文（Stage1-D2，借鉴 DSH .agents/notes 四态 B4）

D395-a（2026-08-17）交付四态目录 + commit-msg Note 引用门禁；D406 改 lessons 写入 proposed/。
本任务（D472）在其上补生命周期闭环，三处缺陷：

1. **注入污染（M7 噪音）**：`hook-check-memory.sh` 用 `find memory/ -name "*.md"` 扫全目录——archived/（20 个旧教训）+ rejected/ 注入当前任务上下文，把"过时教训"当"现行教训"。修：只读 `memory/notes/proposed/ + implemented/`（K3 §4.2 "archived/rejected 不注入"）。
2. **迁移无门禁（僵尸 proposed）**：README 有"状态迁移 = git mv"文字但无脚本检查。修：`scripts/control-tower/check-notes-lifecycle.sh` 扫 proposed/，提取 D#（中文 任务:/相关 D#: 或英文 name:/class:/description: 的 D\d+）+ task-state 该 D# ∈ {impl_done, spec_done} 双条件命中 → 判僵尸 → exit 1 阻断。挂 pre-commit 组 6 区域（条件触发，保持 <1s）。
3. **字段契约分裂**：README 四字段头（状态/日期/决策/理由）vs check-lessons-learned 英文十字段。修：改头保留扩展字段（兼容已有 Note 解析），sed -i.bak 跨平台。

## 参考系（S-12 决策记录）

- Anthropic 工程基线：fail-closed（门禁 exit 1 阻断）+ 脚本验证（check-*.sh 不靠 review）
- DeepSeek .agents/notes 四态（B4）：实现落地必须 git mv 的纪律
- 第一性原理：决策生命周期 = 提出 → 落地 → 归档，断环在哪就补哪（注入过滤/迁移门禁/字段对齐）

## 验收锚点

- 门禁对真实僵尸命中（D406 Note + 测试残留 test-d406 被点名 exit 1）
- hook 注入只读活态（archived 零注入测试通过）
- 测试 21/21 绿（check-notes-lifecycle 17 + hook-check-memory 4，U7/CT-40 配对）
