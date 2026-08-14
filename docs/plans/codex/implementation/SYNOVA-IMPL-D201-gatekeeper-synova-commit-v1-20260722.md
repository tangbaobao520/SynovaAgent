# SynovaAgent -- D201 校验网守（synova-commit）实施方案 v1.0

> 2026-07-22 | 权威文档 #17：创始人控制塔 -- 第二章
> **唯一的物理阻断点（pre-commit hook）有 --no-verify 逃生舱——且该逃生舱已被实际使用。synova-commit 包装 git commit，强制执行全部检查，且没有绕过开关。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：pre-commit-check.sh 存在、.git/hooks/pre-commit 存在
- [x] Get-Content 读取：第二章第 1-100 行（问题诊断、包装器设计、调用契约）
- [x] Select-String 验证：bypass.log 存在于 .claude/bypass.log，pre-commit-check.sh 调用 check-plan-integrity.sh
- [x] 权威文档原文引用：第二章 §2.2——synova-commit 调用契约（--task-id、--agent、--message、--files）

---

## Loop Engineering V4.4.5 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 提交治理。D201 构建 synova-commit：一个 bash 包装器，是通往 git commit 的唯一路径。包装器在允许提交前运行 pre-commit-check.sh（全部 8 组）。没有 --no-verify 标志。Agent 想要提交代码，必须通过这扇门。

### Q1：调研
- 权威文档 #17 第二章 §2：synova-commit 调用契约设计
- AGENTS.md 铁律 0-5 错误 #17：--no-verify 依赖（D8a-D8f 全部绕过）
- AGENTS.md 铁律 0-5 错误 #18：pre-commit 超时不修，绕过它
- 现有：pre-commit-check.sh 8 组硬阻断、.claude/bypass.log 追踪记录

### Q2：范围
- 最小实现：synova-commit bash 脚本，包装 git commit 并强制执行 pre-commit 检查
- 不做：替换整个 git（仅包装 commit，不包装 push/add/branch）、实时绕过检测（post-commit 审计已存在）

### Q3：验收
- 入口：Agent 调用 synova-commit --task-id D123 --agent claude-code --message "feat: ..." --files "src/foo.ts"
- 交互：包装器运行 pre-commit-check.sh → 通过则执行 git commit --no-verify（包装器已验证过）
- 结果：全部检查通过后提交成功，或失败并输出错误信息

### Q4：契约与测试
- @input：task-id、agent 标识符、commit message、可选文件列表
- @output：退出码 0=成功、1=检查未通过、2=包装器自身降级（允许提交但告警）
- @degraded：pre-commit 脚本未找到 → 告警 + 允许提交（网守降级）
- 测试：全部检查通过 → 提交、检查失败 → 阻断、pre-commit 缺失 → 降级通过

---

## 当前状态（2026-07-22，grep 验证）

- scripts/pre-commit-check.sh：存在（8 组硬阻断，每组 <10s）
- .claude/bypass.log：存在（追踪 --no-verify 计数）
- .git/hooks/pre-commit：存在（调用 pre-commit-check.sh）
- synova-commit 包装器：零存在
- 权威文档 #17 第二章 §2.2：含必需参数的调用契约规范

---

## 构建内容

### 1. scripts/control-tower/synova-commit（bash 可执行脚本，约 150 行）

```
用法: synova-commit --task-id <ID> --agent <名称> --message <消息> [--files <F1 F2...>]
```

执行流程：
1. 验证必需参数（task-id、agent、message）
2. 如果提供了 --files：仅暂存这些文件。否则：使用当前暂存区
3. 对暂存文件运行 pre-commit-check.sh
4. 如果 pre-commit 通过（exit 0）：执行 git commit 并附带消息
5. 如果 pre-commit 失败（exit 1）：输出错误清单，exit 1，不提交
6. 如果 pre-commit 脚本缺失（exit 2）：记录告警，允许提交（网守降级）

### 2. 与 Claude Code 集成

配置 Claude Code 的 PostToolUse 设置以使用 synova-commit：
- 替换：git commit -m "msg"
- 替换为：synova-commit --task-id "$TASK_ID" --agent "claude-code" --message "msg" --files "$CHANGED_FILES"

### 3. 网守健康检查

```
synova-commit --health
```
返回：ok=true（如果 pre-commit 脚本存在且可执行）、ok=false + 原因（如果降级）

---

## 不做什么

- 不替换 git push/add/branch（仅 gate commit）
- 不修改 pre-commit-check.sh（原样调用）
- 不新增超出 pre-commit 已有范围的检查

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- synova-commit 参数验证：@input（args）/ @output（退出码 + 消息）/ @degraded（缺少必需参数 → exit 1）
- synova-commit 健康检查：@input（无）/ @output（{ok: bool, reason: string}）/ @degraded（pre-commit 缺失 → ok:false）
- 4 组 fixture：正常（全部通过）、边界（pre-commit 缺失）、错误（无效参数）、时序（检查在 10s 内运行）

### L2a：接线测试
- synova-commit 调用 pre-commit-check.sh（grep "pre-commit-check.sh" scripts/control-tower/synova-commit）
- Claude Code PostToolUse 已配置使用 synova-commit（验证：.codex/hooks.json 或 .claude/settings.json）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| synova-commit | Claude Code PostToolUse hook | grep "synova-commit" .claude/settings.json |
| synova-commit (health) | 控制塔健康仪表盘 | 人工验证 |

---

## 完成标准

```
[ ] synova-commit bash 脚本：--task-id、--agent、--message、--files 参数
[ ] 执行流程：验证参数 → pre-commit-check.sh → git commit 或阻断
[ ] 退出码 0：全部通过，提交完成。退出码 1：检查失败，阻断
[ ] 退出码 2：网守降级（pre-commit 缺失），允许提交 + 告警
[ ] --health 标志：返回网守状态
[ ] 不存在 --no-verify 标志（物理上不可能绕过）
[ ] bash -n 语法检查通过
[ ] 集成测试：synova-commit 有效参数 → 提交成功
[ ] 集成测试：synova-commit 无效代码 → 阻断 + 错误输出
[ ] 零 as any（bash 脚本——无 TypeScript）
[ ] ≥6 个测试：参数验证 (2) + 通过 (1) + 阻断 (1) + 健康检查 (1) + 降级 (1)
```

---

## 权威文档引用

- 权威文档 #17：创始人控制塔 -- 第二章：校验网守（synova-commit）
  - §2.2：调用契约规范
  - §1：问题诊断（为什么现有 pre-commit 不够）
  - §2：核心设计（包装器模式——通道，而非剥夺权限）
