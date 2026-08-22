# D471 — packages/ as any 清理 + 铁律 38 审计测试扩围（K3 P1-C1 整改）

> 交付: 2026-08-22 | 分支: feat/win-d471-packages-as-any-cleanup | commit: 3c9e88e0 | PR: #95
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D471-packages-as-any-cleanup-20260822.md

## 任务

K3 审计 P1-C1：铁律 38「as any 零容忍」声称失效——门禁组 1 只扫 src/，packages/ 实测 33 处生产 as any 无门禁；审计测试只有 console.warn 无断言（空壳，违反铁律 48）。

## 变更（写集 7 文件）

| 文件 | 内容 |
|------|------|
| packages/sog-core/src/sog-core-schema.ts | 24 行 as any → 类型安全替换；VALIDATORS 声明改交叉类型 |
| packages/sog-core/src/sog-schema-registry.ts | 8 处 → 枚举语义化转换 + 类型化索引读写 |
| packages/connector-registry/src/registry.ts | 对象级 `} as any)` → handler 内对 await 结果断言 |
| packages/test-kit/tests/e2e/02-*.test.ts | 2 处 res.json() as any → 内联响应类型 |
| packages/test-kit/tests/architecture/05-as-any-audit.test.ts | 扫描根扩 src/+packages/ + expect 断言 + 2 排除规则测试；交付后自审重写注释过滤为跨行块注释状态机 + .tsx 纳入扫描 |
| packages/sog-core/tests/sog-core-schema.test.ts | 前置修复坏 import + 陈腐计数断言同步 |
| packages/connector-registry/tests/connector-registry.test.ts | 前置修复坏 import（×2） |

## DS 验收证据

- DS1: rg as any → 生产代码 0 命中（仅注释/fixture）
- DS3: 审计测试 3/3 pass（RED 33 处失败 → GREEN 0）
- DS4: sog-core 67/67、connector-registry 7/7、test-kit 16=16（基线既有）零新增、根 tsc 28=28
- DS5-DS7: 暂存 9 文件与写集一致 / 无 no-verify / 已推送 + PR #95

## 关键决策与教训

1. **strict 模式下内联类型须必选字段**：`(p as { field?: string })?.field` 的 `string | undefined` 不可赋给 `Array.includes(string)` → 用 `(p as { field: XProps['field'] })?.field`（必选字段 + 非空接收方 → `?.` 结果无 undefined；cast 擦除后与 `as any` 运行时逐字节相同）。
2. **typeof 收窄不跨表达式传播**：`typeof a === 'string' && a.length` 若 a 是两次独立索引表达式则第二处仍 unknown → 局部 const 收窄。
3. **枚举计数断言会陈腐**：append-only 枚举扩展（14→18 节点）后硬编码计数测试失败——但测试 import 坏掉导致从未暴露。修 import 后必须连带同步陈腐断言。
4. **交叉类型声明**（`Record<Enum, fn> & Record<string, fn | undefined>`）同时保住枚举穷尽性和运行时字符串索引读写，比 `Record<string, ...>` 平替更优。
5. **synova-commit --files 是多参数**：每个文件独立参数，不能用一个大引号串（会当成单个超长文件名）。
6. **首推必被 bypass.log 对账拦**（D355/D363 同模式）：synova-commit 的 push 先于 COMMITTED 记录落盘 → 手动重推即过；隔离 worktree 提交后须补记 COMMITTED 到主树 bypass.log。
7. **审计工具的注释过滤不能靠"行内含 \* 即跳过"**：初版 `!line.includes('*')` 把乘法运算符代码行整行漏报（自审发现的盲区）；同行剥离又会把多行块注释续行（JSDoc ` * 零 as any`）误报。正确解法：跨行块注释状态机（开合追踪 + 等长空格剥离 + `//` 截断后匹配）。
