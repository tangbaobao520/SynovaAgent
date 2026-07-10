#!/usr/bin/env bash
# ============================================
# pre-doc-audit.sh — 写技术开发文档前必跑
# ============================================
# 用途：在任何"待启动"任务写技术文档之前，自动审计相关代码现状。
# 输出：标准化的审计结果，可直接粘贴到文档的 Phase -1 审计表格中。
# 原则：不看记忆，只看代码。不假设，只测量。
#
# 用法：bash scripts/pre-doc-audit.sh <任务ID>
# 示例：bash scripts/pre-doc-audit.sh T7a
# ============================================

set -euo pipefail

TASK_ID="${1:-}"
if [ -z "$TASK_ID" ]; then
  echo "用法: bash scripts/pre-doc-audit.sh <任务ID>"
  exit 1
fi

echo "=== Phase -1 自动审计 — 任务: $TASK_ID ==="
echo "审计时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ─── 通用检查（所有任务都跑）───

echo "## 环境基线"
echo ""
echo '```bash'
echo "git status --short"
git status --short 2>/dev/null || echo "(非git仓库)"
echo "git branch --show-current"
git branch --show-current 2>/dev/null || echo "(非git仓库)"
echo "git stash list | wc -l"
git stash list 2>/dev/null | wc -l || echo "0"
echo "timeout 10 bash scripts/pre-commit-check.sh  # 验证pre-commit耗时"
echo '```'
echo ""

# ─── 任务特定检查 ───

case "$TASK_ID" in
  T7|T7a|T8)
    echo "## 本体层审计"
    echo ""
    
    # 1. EdgeType枚举完整性
    echo "### EdgeType枚举（packages/ontology/src/edge-types.ts）"
    echo ""
    echo "当前边数量:"
    grep -c ":'" packages/ontology/src/edge-types.ts 2>/dev/null | head -1 || echo "文件不存在"
    echo ""
    echo "全部边名:"
    grep -oP "\s+(\w+):\s*'" packages/ontology/src/edge-types.ts 2>/dev/null | sed "s/.*\(\w\+\):.*/\1/" | sort || echo "解析失败"
    echo ""
    echo "ALL_EDGE_TYPES数组中的边数:"
    grep -c "EdgeType\." packages/ontology/src/edge-types.ts 2>/dev/null | tail -1 || echo "0"
    echo ""

    # 2. JSON Schema文件
    echo "### JSON Schema（extensions/ontology/edge-types/）"
    echo ""
    echo "已有JSON Schema文件:"
    ls extensions/ontology/edge-types/*.json 2>/dev/null | while read f; do echo "  $(basename $f .json)"; done || echo "目录不存在"
    echo ""

    # 3. 目标边在代码中的引用
    echo "### 目标边引用统计"
    echo ""
    if [ "$TASK_ID" = "T7a" ]; then
      echo "BRAND_BUILDS引用:"
      grep -rn "BRAND_BUILDS" src/ packages/ontology/src/ extensions/sentinels/ 2>/dev/null | head -20 || echo "  零引用"
    fi
    echo ""

    # 4. NodeType相关
    echo "### 相关NodeType"
    echo ""
    if [ "$TASK_ID" = "T7a" ]; then
      echo "BRAND节点:"
      grep "BRAND" packages/ontology/src/node-types.ts 2>/dev/null || echo "  不存在"
      echo ""
      echo "brand.json字段:"
      cat extensions/ontology/resource/brand.json 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  文件不存在或JSON损坏"
    fi
    echo ""

    # 5. compute目录结构
    echo "### 共享compute目录结构"
    echo ""
    echo "目录层级:"
    ls -d extensions/sentinels/shared/computes/*/ 2>/dev/null | while read d; do echo "  $(basename $d)"; done || echo "  目录不存在"
    echo ""
    echo "已有compute函数数:"
    find extensions/sentinels/shared/computes -name "compute-*.ts" 2>/dev/null | wc -l || echo "0"
    echo ""
    echo "index.ts导出函数数:"
    grep -c "export {" extensions/sentinels/shared/computes/index.ts 2>/dev/null || echo "0"
    echo ""

    # 6. 测试路径
    echo "### 测试文件路径模式"
    echo ""
    echo "共享compute测试:"
    ls tests/sentinels/shared/compute-*.test.ts 2>/dev/null | head -5 | while read f; do echo "  $(basename $f)"; done || echo "  无已有测试"
    echo ""
    echo "已有契约ID格式样本:"
    grep -h "契约ID:" extensions/sentinels/shared/computes/l2-value/compute-*.ts 2>/dev/null | head -3 || echo "  无样本"
    echo ""

    # 7. ontology-loader加载机制
    echo "### ontology-loader加载机制"
    echo ""
    echo "边加载方式:"
    grep "edge-types\|edgeTypes" src/l4/ontology-loader.ts 2>/dev/null | head -5 || echo "  文件不存在"
    echo ""

    # 8. vitest配置
    echo "### vitest配置"
    echo ""
    echo "include模式:"
    grep "include:" vitest.config.ts 2>/dev/null || echo "  配置不存在"
    echo ""
    ;;

  T9)
    echo "## 专家知识审计"
    echo ""
    
    echo "### 专家THEORY.md文件清单"
    for d in expert/*/; do
      expert=$(basename "$d")
      theory="${d}THEORY.md"
      if [ -f "$theory" ]; then
        lines=$(wc -l < "$theory")
        has_agency=$(grep -c "委托.代理\|agency\|代理成本" "$theory" 2>/dev/null || echo "0")
        echo "  $expert: $lines行, 委托-代理相关内容: $has_agency处"
      else
        echo "  $expert: THEORY.md不存在"
      fi
    done
    echo ""

    echo "### GA标注API状态"
    echo "端点:"
    grep "app\.\(get\|post\|put\)" src/routes/ga-annotations.ts 2>/dev/null | head -10 || echo "  文件不存在"
    echo ""

    echo "### 设计方案的pre-code"
    if [ -f "docs/synova/business/SYNOVA-管理经济学-知识体系设计-20260623.html" ]; then
      echo "设计方案存在: ✅"
      echo "org/THEORY pre-code长度:"
      # 简单检查
      grep -c "委托.代理" "docs/synova/business/SYNOVA-管理经济学-知识体系设计-20260623.html" 2>/dev/null || echo "0"
    else
      echo "设计方案不存在: ❌"
    fi
    echo ""
    ;;

  *)
    echo "## 通用审计"
    echo ""
    echo "（无任务特定检查——仅执行环境基线）"
    echo ""
    ;;
esac

echo "=== 审计完成 ==="
echo ""
echo "下一步：将以上输出粘贴到技术文档的 Phase -1 审计表格中。"
echo "不要凭记忆改写——保持原样。"
