#!/bin/bash
# 铁律 38: as any 零容忍 — pre-commit 硬阻断
# 每次 commit 前执行，超过 0 处 as any → 阻断提交。
set -euo pipefail

# 精确匹配代码中的 as any 语法模式（as any; / as any) / as any] / as any, / as any } / as any>）
# 注释中的 "as any" 文字不会匹配这些语法模式
AS_ANY=$(grep -rn -E 'as any[][;,)}>]' src/ --include="*.ts" \
  | grep -v "node_modules" \
  | grep -v "\.test\." \
  | grep -v "\.d\.ts" \
  | grep -v '//\|/\*\*' \
  || true)

if [ -n "$AS_ANY" ]; then
  COUNT=$(echo "$AS_ANY" | wc -l | tr -d ' ')
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  ❌ 铁律 38 违规: 发现 ${COUNT} 处 as any                     ║"
  echo "║                                                              ║"
  echo "║  as any = 类型安全真空 = 埋雷。                              ║"
  echo "║  逐处用具体类型 / unknown / Record<string,unknown> 替代。    ║"
  echo "║  替代方案见 CLAUDE.md 铁律 38。                               ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "$AS_ANY"
  exit 1
fi

echo "✅ 铁律 38: as any 检查通过 (0 处)"
exit 0
