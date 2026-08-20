# START-HERE.md — 新伙伴入职路径

> 目标：**30 分钟内**了解"这是什么项目、我们怎么走到这里的、现在在哪"。
> 适用：人（创始人/新伙伴/投资人）与 Agent（开发/审计）。

---

## 路径 A：人（非技术背景）

1. `CHRONICLE.md` — 三代编年史（30 分钟通读，建立"来时的路"）
2. `docs/authority/PRD.md` — 产品是什么、为谁、为什么
3. `docs/authority/ARCHITECTURE.md` — 系统怎么运转（人话版）
4. `docs/authority/STATUS.md` — 现在做到哪了
5. 需要细节时 → `INDEX.md` 的九类索引按需深入

## 路径 B：Agent（开发/审计）

1. `AGENTS.md` — 铁律与协作规范（**必须**，commit 门禁会拦）
2. `CLAUDE.md` — 工程细节与技术权威
3. `CHRONICLE.md` — 历史（避免重复踩三代踩过的坑）
4. `docs/synova/coordination/TASK-ROUTING.md` — 四角色两条线分工（开发线 Codex/DSH/Claude Code + 审计线 K3）
5. 文档体系规则：`INDEX.md`（地图）+ `docs/authority/DOCS-REGISTRY.yaml`（台账）——新文档先查台账再建

## 三件不要做的事

- **不要改历史**：`CHRONICLE.md` 只增不改；git 历史不改写（ClawOrg 提交身份是历史事实）
- **不要创建无台账的文档**：先查 `DOCS-REGISTRY.yaml`，确定 type/status/owner 再落笔
- **不要把历史当现状**：描述"现状"只信权威层（PRD/ARCHITECTURE/STATUS）；历史文档一律带日期和状态

---

*入职路径本身也是文档体系的一部分，发现更好的阅读顺序请更新本文件。*
