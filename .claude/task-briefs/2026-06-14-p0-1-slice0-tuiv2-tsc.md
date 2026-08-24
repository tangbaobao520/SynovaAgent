# Task Brief: P0-1 Slice 0 — 修复 tui-v2 2 处 TS1128 语法错误

> 生成时间: 2026-06-14
> 分支: feat/prompt-architecture
> 父任务: P0-1 全量 tsc 清零（70+ 错误）
> 本 Slice: 修复 2 处 TS1128，解锁后续 tsc 类型检查

## 项目身份（每次重读）

- SynovaAgent = 组织数字孪生诊断 + 持续增长导航系统。
- 五层架构：L1(交互)→L2(编排)→L3(洞察)→L4(本体)→L5(存储)

## 本任务在哪一层

L1 (tui-v2/lib/) — TUI V2 基础库。
改动: 删除 2 处多余 `}`（纯语法修复，不涉及逻辑）。
无跨层风险。

## 文档引用

- 铁律 0-2: tsc 零错误是 pre-commit 硬阻断
- CLAUDE.md §铁律速览: 铁律 35 自动化优先（tsc 规则不靠 review）

## 接口审计

- bootstrap.ts: setupTerminalEncoding() → Promise<void>（已存在，不修改签名）
- grapheme.ts: splitGraphemes(text: string) → string[]（已存在，不修改签名）

## 数据流

无数据流变更。本次仅修复语法错误。

## 用户旅程

开发者: git commit 时不再被 tui-v2 TS1128 阻断。
后续: 暴露 70+ 类型错误，为系统性修复铺路。

## Done 标准

- [ ] 入口可触达: tsc --noEmit 中 src/tui-v2/lib/ 不再出现 TS1128
- [ ] 链路走通: tsc 全量通过（本 Slice 只消除 2 个，暴露更多 → 不作为本 Slice 阻断条件）
- [ ] 结果可见: git commit + push

## 验证命令
```bash
npx tsc --noEmit 2>&1 | grep "src/tui-v2"  # 期望零输出
```
