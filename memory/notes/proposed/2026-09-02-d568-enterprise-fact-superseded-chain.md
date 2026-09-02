# D568: enterprise-fact 文件版版本链（supersededBy 回填 + 默认读链头）

> 状态: proposed
> 日期: 2026-09-02
> 决策: `scripts/control-tower/enterprise-fact-store.ts` 的 `createFact()` 实现真实版本链——更新时旧条目**归档保留**为 `{key}.v{N}.md`（同 category 目录），其 front matter 回填 `supersededBy={key}#v{新版本号}`；`{key}.md` 恒为链头。`readFact()` 默认返回链头（调用方零改动，行为兼容）；新增 `readFactVersion(category, key, version)` / `listFactVersions(category, key)` 提供追溯；`listFacts()` 按文件名模式过滤版本文件（只列链头）；`deleteFact()` 删链头时同步清理该 key 全部历史版本（防孤儿/复活）。
> 理由: 原实现注释声称"不覆盖 — 后续可通过 version 链追溯"（L91-92）但 L95 `writeFileSync` 直接覆盖同路径，`supersededBy` 恒 null（L81）——每文件单条、历史无处追溯，注释与实现语义矛盾（K3 产品线 17 点批 18-5，🔴级声明/实现脱节）。D551 ga-calibration 先例确立 `supersedes`/`supersededBy` + 默认读链头语义；L4 `AgentMemoryStore`（enterprise_fact, CLAUDE.md 数据流"版本化 + superseded_by 链"）为同一企业事实层的 SQL 侧实现，文件侧对齐后两层语义一致。方案取"同目录版本后缀文件"而非"历史子目录"：`listCategories()` 不会把历史目录误报为 category，`listFacts()` 只需文件名模式过滤，对调用方（fact-approval-service / conflict-scanner / agent-memory-store）降级面最小。注释保留"不覆盖"字样——实现后该声明第一次为真。
