<!--
  CLAIM-TAG-SPEC.md — <claim> 标签规范 v1.0
  适用: D329 之后新写的权威文档，以及重大修订的旧文档
  旧文档保持原样，偏差通过注册表管理
-->

# `<claim>` 标签规范 v1.0

## 设计目标

让文档中的"已实现/已接线/已验证"声明**机器可读、可自动验证**，降低对 LLM 语义理解的依赖。

## 适用范围

| 文档类型 | 是否强制 | 说明 |
|---------|:-------:|------|
| D329 之后新写的权威文档 | ✅ 强制 | 所有 IMPLEMENTED/PARTIAL 声明必须加 `<claim>` |
| 重大修订的旧文档 | ⚠️ 建议 | 修订涉及的部分加 `<claim>`，其余保持原样 |
| 未改动的旧文档 | ❌ 不强制 | 偏差通过 `AUTHORITY-DEVIATION-REGISTRY` 管理 |
| 非权威文档（研究线、审计报告） | ❌ 不强制 | 本规范只约束权威文档 |

## 标签格式

### 最小必需属性

```xml
<claim id="唯一标识"
       status="状态枚举">
声明文本
</claim>
```

### 完整属性（推荐）

```xml
<claim id="E02-1"
       status="IMPLEMENTED"
       evidence="文件路径:行号"
       since="D202"
       test="测试文件路径"
       gap="若 PARTIAL，说明缺失部分">
声明文本
</claim>
```

## 属性定义

| 属性 | 必需 | 类型 | 说明 |
|------|:---:|:---:|------|
| `id` | ✅ | 字符串 | 全局唯一标识，格式 `{模块缩写}-{序号}`，如 `E02-1` |
| `status` | ✅ | 枚举 | `IMPLEMENTED` / `PARTIAL` / `PLANNED` / `DEPRECATED` |
| `evidence` | 条件 | 路径 | `status="IMPLEMENTED"` 或 `"PARTIAL"` 时必须提供 |
| `since` | ❌ | D# | 该声明首次成立的 dev doc 任务号 |
| `test` | ❌ | 路径 | 验证该声明的测试文件路径 |
| `gap` | 条件 | 文本 | `status="PARTIAL"` 时必须说明缺失部分 |

## status 枚举详解

| 状态 | 含义 | evidence 要求 | gap 要求 |
|------|------|:------------:|:-------:|
| `IMPLEMENTED` | 已实现并可运行 | 必须，指向代码文件 | 无 |
| `PARTIAL` | 部分实现，有已知缺失 | 必须，指向已有代码 | 必须，说明缺失 |
| `PLANNED` | 规划中，尚未实现 | 无 | 无 |
| `DEPRECATED` | 已废弃，不再适用 | 无 | 可选，说明替代方案 |

## 示例

### 已实现声明

```markdown
<claim id="E02-1"
       status="IMPLEMENTED"
       evidence="src/routes/direction-monitor.ts:45"
       since="D202"
       test="tests/routes/direction-monitor.test.ts">
方向监测引擎已接线到路由层，支持 HTTP GET 查询。
</claim>
```

### 部分实现声明

```markdown
<claim id="E02-2"
       status="PARTIAL"
       evidence="src/routes/direction-monitor.ts:45"
       since="D215"
       gap="WebSocket 实时推送未实现，当前为 5 秒轮询">
方向监测引擎支持查询模式。
</claim>
```

### 规划中声明

```markdown
<claim id="E02-3"
       status="PLANNED"
       since="D300">
方向监测引擎将支持 WebSocket 实时推送（预计 D320 实现）。
</claim>
```

## 嵌套规则

`<claim>` 标签**可以**嵌套在 Markdown 段落、列表项、表格单元格中。但不能嵌套在另一个 `<claim>` 内部。

## 与注册表的关系

| 场景 | 文档中的 `<claim>` | 注册表中的记录 |
|------|------------------|--------------|
| 新文档，新声明 | `status="IMPLEMENTED"` | 无（自动信任，由 doc-audit 验证） |
| 旧文档已知偏差 | 无（旧文档无标签） | `P0/P1` 记录，引用文档章节 |
| 修订后修复偏差 | 新增 `<claim>`，标注 `since` | 更新注册表状态为 "已修复" |

## 版本迭代

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-08-12 | 首版：4 状态枚举 + 6 属性 + 嵌套规则 |
