#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# inject-commit-instruction.sh — SessionStart hook 注入 (D201-Phase2)
#
# 在 Agent 开始工作前将 synova-commit 用法注入上下文。
# 由 SessionStart hook 调用，输出指令到 stdout。
#
# 权威文档 #17 第二章 Ch2 §7.3：文件结构总览
# ═══════════════════════════════════════════════════════════════════════════════

cat << 'INSTRUCTION'
╔══════════════════════════════════════════════════════════════════════════════╗
║  [SYNOVA] 提交必须通过网守                                                     ║
║                                                                              ║
║  用法:                                                                       ║
║     git synova-commit --task-id <D#> --agent <名称> --message "<消息>"          ║
║                                                                              ║
║  示例:                                                                       ║
║     git synova-commit --task-id D201 --agent claude --message "feat: 提交示例"  ║
║                                                                              ║
║  ⚠ 禁止直接使用 git commit (会被检测并记录)                                     ║
║  ⚠ synova-commit 没有 --no-verify 选项                                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
INSTRUCTION
