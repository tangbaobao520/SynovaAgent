# Task Brief: Codex 审计修复 — 铁律违规清零

> 2026-07-05 | V4.4.0 | as any count: 待清零

## Q1 调研

a) 审计发现 5 个 P0 + 2 个 P1 铁律违规，分布 Phase 1-4。
b) 根因：早期代码标准低、类型定义不完整导致逃生、没有端到端验收。
c) memory/ 教训：as any 零容忍（47次）、catch 空吞（静默降级）、self-review 不可靠。

## Q2 范围

**做：** 逐文件修掉 7 个审计违规 + 自己的代码缺陷

| # | 文件 | 问题 | 修法 |
|---|------|------|------|
| 🔴P0 | LeftPanel.tsx:39,44 | `.catch(()=>{})` 空吞 | `catch(err) { log.warn }` |
| 🔴P0 | CenterPanel.tsx:78 | `(msg as any)._id` | 补类型定义 |
| 🔴P0 | RightPanel.tsx:142 | `catch{return null}` 无 log | 加 log.warn |
| 🔴P0 | im-channel.ts:94,122 | `catch(err:any)` | `unknown` + 守卫 |
| 🟡P1 | MessageItem.tsx:82 | `catch{return ''}` 无 log | 加 log.warn |
| 🟡P1 | email-service.ts:83,87 | `!` 非空断言 | 条件判断替代 |
| ⚠️ | solution-generator.ts | persist fire-and-forget | 返回 Promise |
| ⚠️ | solution-generator.ts | Date.now() ID | crypto.randomUUID |
| ⚠️ | RightPanel.tsx apiFetch | catch 吞 null | log.warn + 返回 |

**不做：** 功能增强（IME/命令执行/导航）— 这是新功能不是审计修复

## Q3 验收

入口：代码扫一遍，7 个违规点全部修复
处理：tsc 零错误 + vitest 全量通过
结果：pre-commit 5 项全绿

## Done 标准
- [ ] LeftPanel.tsx 空吞 catch 已消除
  verify: grep -rn "catch" electron-renderer/src/components/LeftPanel.tsx | grep -c "{}" | xargs test 0 -eq
- [ ] CenterPanel.tsx as any 已消除
  verify: grep -rn "(msg as any)" electron-renderer/src/components/CenterPanel.tsx | wc -l | xargs test 0 -eq
- [ ] im-channel.ts err:any 已消除
  verify: grep -rn "catch.*err.*any" src/l1/im-channel.ts | wc -l | xargs test 0 -eq
- [ ] tsc 零错误
  verify: npx tsc --noEmit
- [ ] vite build 通过
  verify: npx vite build --config electron-renderer/vite.config.ts 2>&1 | grep -q "built in"
