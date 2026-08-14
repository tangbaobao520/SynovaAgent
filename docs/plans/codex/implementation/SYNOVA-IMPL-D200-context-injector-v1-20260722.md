# SynovaAgent -- D200 上下文注射器 实施方案 v1.0

> 2026-07-22 | 权威文档 #17：创始人控制塔 -- 第一章
> **根问题：Agent 从未打开权威文档就开始写。注射器把权威文档片段直接嵌入 task brief 的 Q1c 字段——在 Agent 开始思考之前，关键信息已经在上下文窗口里了。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：6 个章节文件存在，共计约 140KB
- [x] Get-Content 读取：第一章第 1-100 行（问题定义、架构总览、注射片段格式规范）
- [x] Select-String 验证：task-start.sh 存在于 scripts/workflow/，generate-task-brief.py 在第一章 §9 中被引用
- [x] 权威文档原文引用：第一章 §9"具体实现：脚本设计"——注射器作为 task brief 生成后的后处理步骤运行

---

## Loop Engineering V4.4.5 -- 强制任务启动（Q1-Q4 必须在写代码前回答）

### Q0：项目身份
SynovaAgent 开发流水线治理。D200 构建上下文注射器：一个后处理脚本，读取已生成的 task brief，解析其中引用的权威文档 ID（如"Auth Doc #4"或"权威文档 #16"），打开对应文档，提取关键片段（Edge ID、函数签名、文件路径），注入到 task brief 的 Q1c 字段。Agent 打开 brief 时，权威文档内容已经在那里——不可能跳过。

### Q1：调研
- 权威文档 #17 第一章 §3-§4：注射片段格式规范、版本一致性验证
- 权威文档 #17 第一章 §7：权威文档 ID 映射表
- 权威文档 #17 第一章 §9：具体脚本设计
- memory/ 教训：铁律 0-5 错误 #1（不读权威文档就写了 D8f——注射器防止此类错误）。铁律 0-5 错误 #22（引用了不存在的文件——注射器验证路径）。

### Q2：范围
- 最小实现：context-injector.sh 读取 {task-id}.md，提取文档 ID 如"Auth Doc #4"或"权威文档 #16"，打开对应文件，提取关键片段，追加到 Q1c 字段
- 不做：完整文档解析（MVP 仅做正则提取 Edge ID、文件路径、函数名）、实时版本同步（MVP：注入 + 版本不一致时告警）

### Q3：验收
- 入口：task-start.sh 在 Q3 之后、Q4 之前调用 context-injector.sh {task-id}
- 交互：注射器读取 brief → 找到"Auth Doc #N"引用 → 打开文档 → 提取片段 → 写回 brief
- 结果：task brief 的 Q1c 字段现在包含结构化的注入块，含 Edge ID、文件路径和版本戳

### Q4：契约与测试
- @input：task brief Markdown 文件 + ID 映射表中的权威文档文件路径
- @output：同一个 task brief 文件，Q1c 段被追加/替换为注入内容
- @degraded：权威文档未找到 → 注入告警 + 继续。版本不一致 → 注入最新版本 + 告警
- 测试：注入单个文档、注入多个文档、文档未找到 → 降级、版本不匹配 → 告警、brief 无文档引用 → 跳过

---

## 当前状态（2026-07-22，grep 验证）

- scripts/workflow/task-start.sh：存在（生成含 Q1-Q4 的 task brief）
- scripts/workflow/generate-task-brief.py：存在（brief 模板生成）
- 权威文档清单：17 份权威文档，位于 docs/synova/research/*/
- 上下文注射器：零存在
- task brief 的 Q1c 字段：当前为未使用的占位符
- 权威文档 #17 第一章 §9：脚本设计——Python 脚本，读取 brief、解析文档 ID、注入片段

---

## 构建内容

### 1. scripts/control-tower/context-injector.sh + inject-context.py

包装器 bash → 调用 Python 注射核心：
```
context-injector.sh {task-id}
  → 读取 .claude/task-briefs/{task-id}.md
  → 调用 inject-context.py {task-id} --resolve --verify
  → 写回同一文件（Q1c 段）
```

Python 核心（inject-context.py，约 200 行）：
- 解析 task brief 中的权威文档引用（正则："Auth Doc #N"、"权威文档 #N"、"AN"）
- 使用第一章 §7 映射表将文档 ID 解析为文件路径
- 打开解析后的文件，提取关键片段：
  - Edge ID（E-XX 模式）
  - 文件路径（src/... 或 extensions/... 模式）
  - 函数签名（export function/class 模式）
  - 版本/日期戳
- 将以上内容作为结构化 Markdown 块注入到 brief 的 Q1c 字段
- 注射格式（按第一章 §4）：## 注入上下文 + 含来源/版本/片段的表格

### 2. 权威文档 ID 映射表（.codex/control-tower/doc-registry.json）

```
{
  "Auth Doc #1": "docs/synova/research/权威文档01-本体层因果体系权威规范-20260714/",
  "Auth Doc #4": "docs/synova/research/权威文档07-Agent工程能力对标-20260710/",
  ...
  "Auth Doc #17": "docs/synova/research/创始人控制塔系统-20260722/"
}
```

### 3. 集成到 task-start.sh

在 Q3 生成后调用：
```
bash scripts/control-tower/context-injector.sh "$TASK_ID"
```

---

## 不做什么

- 不修改 task brief 的生成方式（仅追加 Q1c）
- 不做实时版本监控（MVP：注入 + 告警）
- 不注入到 Claude Code 的 task brief（.claude/task-briefs/ 是 Codex 的领域）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- inject-context.py parse_brief()：@input（markdown 字符串）/ @output（文档 ID 列表）/ @degraded（无 ID 找到 → 空列表）
- inject-context.py resolve_doc(id)：@input（文档 ID 字符串）/ @output（文件路径或 null）/ @degraded（不在注册表中 → null + log.warn）
- inject-context.py extract_snippets(path)：@input（文件路径）/ @output（含 edges/files/functions 的片段字典）/ @degraded（文件未找到 → 空字典 + warn）
- 每个函数 4 组 fixture：正常 / 边界 / 错误 / 时序

### L2a：接线测试
- context-injector.sh 被 task-start.sh 调用（grep "context-injector.sh" scripts/workflow/task-start.sh）
- inject-context.py 可作为模块导入（python -c "import inject-context"）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| context-injector.sh | task-start.sh | grep -rn "context-injector.sh" scripts/workflow/ |
| inject-context.py | context-injector.sh | grep -rn "inject-context.py" scripts/control-tower/ |

---

## 完成标准

```
[ ] context-injector.sh：包装器脚本，含 --task-id 参数
[ ] inject-context.py：parse_brief + resolve_doc + extract_snippets + inject_into_brief
[ ] doc-registry.json：映射全部 17 份权威文档 ID 到文件路径
[ ] 集成：task-start.sh 在 Q3 生成后调用注射器
[ ] 注射格式：## 注入上下文 + 表格（来源/版本/片段）
[ ] 降级：文档未找到 → 注入告警。版本不匹配 → 注入 + 告警
[ ] 降级：brief 无文档引用 → 跳过注射 + log.info
[ ] 零 as any（Python 等价要求：所有函数有类型注解）
[ ] bash -n 语法检查通过
[ ] ≥6 个测试：parse (2) + resolve (2) + extract (2)
```

---

## 权威文档引用

- 权威文档 #17：创始人控制塔 -- 第一章：上下文注射器
  - §3：注射片段格式规范
  - §4：版本一致性验证规则
  - §7：权威文档 ID 映射表
  - §9：脚本设计规范
