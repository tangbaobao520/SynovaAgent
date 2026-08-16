# audit-full-parallel-pattern.md

## 事故

2026-07-05，主 Codex 审计桌面应用 Phase 0-4 交付物时，初次检查只看"核心文件"入口，未能发现 5 个 P0 级铁律违规：
- LeftPanel.tsx: `.catch(() => {})` 空吞异常 ×2
- CenterPanel.tsx: `(msg as any)._id`
- RightPanel.tsx: `catch { return null; }` 无 log
- im-channel.ts: `catch (err: any)` ×2

这些全都在"非核心"的 electron-renderer 前端组件中——抽样审计永远发现不了。

## 必须遵守的模式

1. **全部读取，不是抽样。** 声称交付的文件列表 = 必须读取的文件列表。一个不落。
2. **多路并行。** 按模块拆分，spawn 多个 worker 子代理同时审计。5 路比 1 路快 3-4 倍。
3. **每个文件输出路径+行数+发现列表。** 汇总铁律违规表。不输出"代码质量不错"这种空话。

## 铁律

铁律 46 — AGENTS.md 中已录入。