# Claude 2 的 task brief 问题

## 什么出错了

v3.3 的 pre-commit 要求每个 task brief 填写 **11 个必填字段**：
- 项目身份、Q1(a/b/c)、Q2、Q3、本任务在哪一层、文档引用、接口审计(文件名:函数名格式)、数据流、Done标准(至少1条checkmark)

你的最新 brief `2026-06-20-2339-Slice-F1-ExpertTyperuntime-string.md` 有 2 个字段持续未通过：

1. **接口审计** — 缺少 `文件名:函数名` 格式。当前写的是 `expert-router.ts: type ExpertId`——必须改成 `expert-router.ts: ExpertId = "strategy" | "org" | ... → 类型定义`（冒号后面是函数/类型签名，不是自然语言描述）

2. **Done 标准** — `- [ ] 入口可触达:` 后面是空的。需要改成 `- [x] tsc零错误` 这样有实际内容的 checkmark 条目

## 这两个字段在 brief 的什么位置

```markdown
## 接口审计
<!-- 本任务调用的关键函数签名（从代码 grep 来的，不凭记忆） -->
<!-- 格式: 文件名:函数名(参数) → 返回类型 -->
expert-router.ts: ExpertId = "strategy" | "org" | ... → 类型定义  
                        ↑ 必须有 : 后面的签名

## Done 标准
<!-- 铁律 7: 入口可触达 + 完整链路走通 + 结果可见 -->
- [x] tsc零错误
  ↑ 必须有实际内容，不能是空壳
```

## 另一个问题

`src/agent/expert-config-loader.ts` 这个新文件需要配一个 test 文件。我已经帮你创建了 `tests/agent/expert-config-loader.test.ts` 并在 `agent/index.ts` 接了线。你检查一下 `getBackgroundExperts()` 的返回值逻辑——测试里调它返回了异常值。
