# SynovaAgent — D73-FIX lifecycle测试补全 实施方案 v1.0

> 2026-07-14 | D73逐行审计产出 | 1项遗漏修复
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。**

---

## 审计发现

**D73开发文档要求**: ≥12测试（goal-sentinel 8 + lifecycle 4）
**实际**: 11测试（仅 goal-sentinel.test.ts），lifecycle 4个测试缺失。

---

## 修复方案

### 新增 tests/growth/goal-sentinel-lifecycle.test.ts

4个测试用例:
1. `registerOnGoalActive`: Goal active → 哨兵已注册到 SentinelRegistry
2. `unregisterOnGoalClosed`: Goal completed → 哨兵已注销
3. `pauseOnGoalPaused`: Goal paused → 哨兵已注销
4. `resumeOnGoalResumed`: paused → active → 哨兵重新注册

**mock策略**: 使用内存MockSentinelRegistry（实现SentinelRegistry接口），验证register/unregister调用次数。

---

## 文件变更

| 文件 | 变更 | 行数 |
|------|------|------|
| tests/growth/goal-sentinel-lifecycle.test.ts | 新建 | ~80行 |

---

## 不做什么

- 不修改 goal-sentinel.ts
- 不修改 goal-sentinel-lifecycle.ts
- 不修改 goal-lifecycle.ts

---

## 完成标准

```
[ ] goal-sentinel-lifecycle.test.ts: 4个it()含expect()断言
[ ] 测试覆盖: registerOnGoalActive/unregisterOnGoalClosed/pauseOnGoalPaused/resumeOnGoalResumed
[ ] 使用 MockSentinelRegistry 验证 register/unregister 调用
[ ] 11+4=15测试全部通过
[ ] zero as any
[ ] npx vitest run tests/growth/ 零新增失败
```