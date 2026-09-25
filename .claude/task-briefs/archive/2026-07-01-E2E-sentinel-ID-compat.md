# Task Brief: E2E sentinel ID 短格式兼容 — API 兼容性修复

> 生成: 2026-07-01 01:00 | 分支: feat/prompt-architecture | V4.2.9

## 项目身份

SynovaAgent 诊断系统。修复 E2E 验证中发现的 API 兼容性问题。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）

本任务修复 L2 编排层（sentinel-service.ts）的 API 兼容性。
- 性质：修复（已有功能）
- 问题背景：E2E 验证时 `POST /api/sentinel/run/cash-runway` 返回 404，
  因为 registry 中哨兵 ID 带 `sentinel-` 前缀（如 `sentinel-cash-runway`），
  但用户传的短 ID 没有此前缀。这是 API 契约与实现之间的不一致。

### b) 文件审计
- `src/agent/sentinel-service.ts` — runSentinelOnce 函数（已有改动，已提交 96961fb5）
- `src/routes/sentinel.ts` — 路由层，POST /run/:id（不需要改）
- `src/sentinel/registry.ts` — 哨兵注册表，get() 方法（不需要改）

关系：修复已有功能，不改路由层和注册表逻辑。

### c) 决策
无冲突。代码已在 96961fb5 提交。本 brief 作为事后文档化 + 验证。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① 理解问题 → ② 确定方案 → ③ 验证代码正确性 → ④ 验证 CI → ⑤ 交付

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 7: 入口可触达 + 完整链路走通 + 结果可见
- 铁律 38: as any 零容忍（确认本次新增代码无 as any）

### b) 本任务执行约束
- rule: "所有哨兵 ID 的命名规范必须一致，不能出现部分有前缀部分没有"
  verify: "grep -r 'sentinelId.*=' src/sentinel/ src/agent/sentinel-service.ts | grep sentinel- | wc -l"
- rule: "API 兼容性修复必须后向兼容（已有完整 ID 的用户不受影响）"
  verify: "如果用户传完整 ID sentinel-cash-runway，registry.get(原始ID) 必须先试"
- rule: "短 ID 补全不能产生双前缀 (sentinel-sentinel-xxx)"
  verify: "补全前检查 !sentinelId.startsWith('sentinel-')"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
1. 验证已提交的 96961fb5 修复在 runSentinelOnce 中的实现是否正确
2. 验证边界情况（空 ID、双前缀、大小写）正确处理
3. 验证其他 sentinel API 端点（GET /findings?sentinelId=）是否有同样问题
4. 确保 CI checker review 通过（补充对应 task brief）

不做什么：
- 不改 registry.ts
- 不改 routes/sentinel.ts
- 不改其他 sentinel API 端点（除非发现同样问题）
- 不改 sentinel 命名规范（保持现有 sentinel- 前缀）

## Q3: 验收 — 入口 → 交互 → 结果

入口: POST /api/sentinel/run/cash-runway（短 ID）
处理: runSentinelOnce 内部补全 sentinel- 前缀 → registry.get('sentinel-cash-runway')
结果: 返回 200 + 完整 sentinelId（'sentinel-cash-runway'） + checkResult

入口: POST /api/sentinel/run/sentinel-cash-runway（完整 ID，已有用户）
处理: registry.get('sentinel-cash-runway') 直接命中
结果: 返回 200，不受影响

入口: POST /api/sentinel/run/（空 ID）
处理: 路由层 400 拦截
结果: 400 { ok: false, error: '缺少 sentinelId' }

## 本任务在哪一层
L2（src/agent/sentinel-service.ts）

## Done 标准
- [ ] verify: grep -q 'startsWith.*sentinel-' src/agent/sentinel-service.ts（防止双前缀）
- [ ] verify: grep -q "先尝试原始 ID" src/agent/sentinel-service.ts（后向兼容）
- [ ] verify: gai assert 'POST /api/sentinel/run/sentinel-cash-runway' returns 200 with full ID
- [ ] verify: gai assert 'POST /api/sentinel/run/cash-runway' returns 200 with sentinel-cash-runway
- [ ] verify: npx tsc --noEmit 零错误（仅本次改动不引入新错误）
- [ ] verify: checker review 通过（brief 与代码一致）
