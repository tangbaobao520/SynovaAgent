# Loop Engineering V4.0 方案：基于历史教训 + 外部参考的设计

> 基于 synova-history-and-v3.9-limitations.md 的 7 个历史错误 + 7 个 V3.9 局限
> + how-claude-code-works（上下文工程压缩）+ loop-engineering-cobus（5 构建块 + loop audit）
> 设计日期：2026-06-23

## 一、V3.9 的核心问题

### 根因 1：软机制无效
8 组硬阻断 ✅ 有效，5 项软机制（hook-check-memory、Q1c 自由填写、info injection）0% 有效。任何依赖 agent 自觉的检查等于不存在。

### 根因 2：承诺验证链断裂
Plan 承诺 → Done 标准 → 测试代码 → CI 结果，五个环节都"存在"但彼此之间没有物理链路串联。

### 根因 3：运行时 vs 文档二元性
JSON 文件通过了所有"文件存在且格式合法"的门禁检查，但运行时仍然走旧 enum——没有检查验证"文件是实际被运行时引用的数据源"。

## 二、从外部仓库学到的关键设计

### 从 how-claude-code-works 学的：三层上下文压缩

Claude Code 的上下文工程有 3 个关键设计可以借鉴：
1. **System Prompt 前缀固定**（不可压缩部分）——对应你们的企业事实层
2. **对话历史的语义压缩**——按重要性分级，不是按时间顺序截断
3. **Tool call/result 对保护**——永远不拆散同一对调用

你们的 context-compressor.ts 已经实现了 strategy='summary'，但没有集成到 ConversationEngine 中。

### 从 loop-engineering-cobus 学的：5 大构建块

该项目的核心框架：Automations + Run-until-done + Skills + Sub-agents + State/Memory。
每个 loop 由这 5 个构建块的组合构成。

可以借鉴的两个具体工具：
- **loop-audit**：`npx @cobusgreyling/loop-audit . --suggest`，分析项目结构给出 Loop Readiness Score
- **loop-init**：脚手架工具，生成 loop 目录结构

但在你们的场景中不需要 npm 包——你们已经有了完整的 pre-commit 体系和 bash 脚本。

## 三、V4.0 方案：5 项改进

### 改进 A：软 → 硬（解决根因 1）

从 how-claude-code-works 和 lessons doc 的共同结论：信息注入型检查对 agent 无效。唯一的转化路径是：不阻断 = 不存在。

| 当前（软）| 改进后（硬）| 实现方式 |
|----------|-----------|---------|
| hook-check-memory 注入信息 | Q1c 必须包含至少 1 个 `memory/` 文件名引用 | pre-commit 检测 task-brief 中的 `Q1c` 字段是否包含类似 `memory/` 的路径 |
| Q0b 自由填写 | Q0b 必须包含 `grep` 命令的实际输出（非描述性文字） | pre-commit 检测 Q0b 字段是否包含 `grep`/`rg` 命令 |
| Done 可证伪性语法检查 | Done 的 `verify:` 命令必须在 CI 中有对应的测试用例 | check-plan-actual.sh 新建 |

### 改进 B：Plan-Actual 自动 diff（解决根因 2）

从 loop-engineering-cobus 的 state/memory 模式 + how-claude-code-works 的不可变前缀模式。

新脚本 `check-plan-actual.sh`：
1. 读取当前 task brief 中 Plan 声明的"新建"文件列表
2. 对比 `git diff --name-only` 的实际文件列表
3. Plan 声明的文件不存在 → 警告（不阻断，但输出到终端）
4. 未在 Plan 中声明的文件被创建 → 硬阻断（exit 1）
5. 如果 Plan 没有声明文件清单 → 硬阻断

### 改进 C：运行时数据源验证（解决根因 4）

新脚本 `check-runtime-authority.sh`：
1. 扫描 `extensions/` 下所有 JSON 定义文件
2. 对每个 JSON 文件，grep `src/` 中有多少文件 import 引用它
3. 如果 import 引用数为 0，标记为"文档用途，非运行时数据源"
4. 如果有 JSON 被标记但 Plan 声称它已完成 → 硬阻断

### 改进 D：踩坑录恢复 + 沉淀（解决根因 3）

1. 新建：`docs/lessons/` 目录
2. 从 CLAUDE.md 铁律注释中提取历史教训，写入 `docs/lessons/` 下的 markdown 文件
3. 当前已存在的 `synova-history-and-v3.9-limitations.md` 就是一个合格的踩坑录原始条目
4. 每个新错误写为 `docs/lessons/` 下的一个文件
5. CLAUDE.md 铁律引用格式：`来源: docs/lessons/xxx.md`

### 改进 E：信息注入的护栏——Plan 审批版（解决根因 3 的变体）

当前 V3.9 的 Plan 审批是"人类审批"——但审批通过后没有物理门禁确保执行。
改进：新增 pre-commit 第 9 组检查 `check-file-driven-acceptance.sh`：
- 如果 task brief 中 Plan 声明了文件驱动相关的改动（关键词：extension、manifest、sentinel、compute）
- 必须同时声明 `acceptance-test:` 字段
- acceptance-test 字段的值必须是一个可执行的 npm test 命令
- 如果 acceptance-test 失败 → 硬阻断

## 四、实施顺序

| 步骤 | 内容 | 工时 | 优先 |
|------|------|------|------|
| 1 | 新增 `check-plan-actual.sh`（改进 B） | 1 小时 | P0 |
| 2 | 新增 `check-runtime-authority.sh`（改进 C） | 1 小时 | P0 |
| 3 | 增强 Q0b/Q1c 强制检查（改进 A） | 0.5 小时 | P1 |
| 4 | 踩坑录目录建立 + 已有条目迁移（改进 D） | 0.5 小时 | P1 |
| 5 | pre-commit 新增 accepted-test 检查（改进 E） | 0.5 小时 | P2 |

## 五、与现有系统的关系

V4.0 不替换 V3.9——在 V3.9 的 8 组 pre-commit 基础上新增：

```
pre-commit 当前 8 组（V3.9）:
1. as any = 0
2. empty catch → log.warn
3. secrets 扫描
4. 新文件有测试
5. 新 export 有调用方 + 铁律 46/47
6. task brief 存在
7. manifest 完整 + tags 合法
8. Done 可证伪性

pre-commit 新增 2 组（V4.0）:
9. Plan-Actual diff（check-plan-actual.sh）
10. 运行时数据源验证（check-runtime-authority.sh）
```

总计 10 组 pre-commit，全部 < 10s。
