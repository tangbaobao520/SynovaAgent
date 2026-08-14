<!--
  Dev Doc: 权威文档偏差治理计划 v1.0
  任务: 建立权威文档的偏差注册表 + CLAIM 标签规范 + doc-audit 接口定义
  目标: 让 Codex 引用权威文档时，能查注册表确认偏差，新文档按 CLAIM 规范写
  前置任务: D328 审计完成，K3 红队审计方法论确认
  版本: v1.0 | 日期: 2026-08-12
-->

# Dev Doc: 权威文档偏差治理计划 v1.0

## 前置条件

1. D328 审计已完成（`docs/synova/audit-reports/2026-08-11-D328.md` 已落盘）
2. Kimi K3 红队审计方法论已确认（Anthropic 五层：Docs-as-Code → doc-audit → pre-commit → 红队 → 可复现记录）
3. 已有审计基础可用：
   - A线-产品完整性缺口审计（2026-08-01，四条件数据 A85/B78/C62/D85）
   - 跨文档一致性审计（2026-07-27）
   - C线-世界级基准差距清单（2026-08-02）

## 交付物（写集表）

| # | 交付物 | 类型 | 路径 |
|---|--------|------|------|
| 1 | Dev Doc 本文件 | 文档 | `docs/plans/codex/implementation/SYNOVA-AUDIT-AUTHORITY-v1-20260812.md` |
| 2 | `<claim>` 标签规范 | 规范 | `docs/synova/research/CLAIM-TAG-SPEC.md` |
| 3 | `doc-audit` 脚本接口定义 | 脚本 | `scripts/control-tower/doc-audit-interface.sh` |
| 4 | 红队审计输入材料清单 | 清单 | `docs/synova/coordination/K3-AUDIT-MATERIALS.md` |
| 5 | 标签规范验证测试 | 测试 | `tests/control-tower/claim-tag-spec.test.sh` |

## §3 详细设计

### §3.1 整体架构（Anthropic 五层映射）

```
L5 持续运行（季度抽检）→ K3 红队 + 控制塔健康审计
        ↑
L4 可复现记录 → 注册表 diff（JSON/Markdown 双轨）
        ↑
L3 红队审计 → K3 语义盲区挖掘（人读注册表）
        ↑
L2 自动验证 → doc-audit 脚本 + pre-commit 组 13
        ↑
L1 Docs-as-Code → <claim> 标签规范
```

### §3.2 旧文档处理策略（不迁移）

旧 17 份权威文档**保持原样**，不动格式。偏差通过注册表管理。

```bash
# 旧文档：零改动，只读
# 新文档：强制加 <claim> 标签
# 修订的旧文档：逐步迁移核心 CLAIM（可选，非强制）

# 判断标准：文档是否被修改
if git diff --name-only HEAD~1..HEAD | grep "权威文档"; then
  # 被修改的文档 → 触发 doc-audit 检查新增/修改的 <claim>
  bash scripts/control-tower/doc-audit-interface.sh --check-modified
fi
```

### §3.3 `<claim>` 标签规范（交付物 2）

只标"已实现/已接线/已验证"类声明，不标每句话。

```markdown
<!-- 规范示例 -->
<claim id="E02-1"
       status="IMPLEMENTED"
       evidence="src/routes/direction-monitor.ts:45"
       since="D202"
       test="tests/routes/direction-monitor.test.ts">
方向监测引擎已接线到路由层。
</claim>

<claim id="E02-2"
       status="PARTIAL"
       evidence="src/routes/direction-monitor.ts:45"
       gap="未实现 WebSocket 实时推送，当前为轮询"
       since="D215">
方向监测引擎支持查询模式。
</claim>

<!-- status 枚举：IMPLEMENTED | PARTIAL | PLANNED | DEPRECATED -->
```

**降级处理**：若文档作者忘记加 `<claim>`，doc-audit 不报错（不阻断），但输出警告。阻断只针对 `status="IMPLEMENTED"` 但 `evidence` 不存在的 CLAIM。

### §3.4 `doc-audit-interface.sh` 设计（交付物 3）

**Phase 0 只定义接口（空壳），Phase 3 填充实现**。

```bash
#!/bin/bash
# doc-audit-interface.sh v0.1 — Phase 0 接口定义
# Phase 3 填充：解析 <claim>、验证 evidence、检查矛盾

set -euo pipefail

readonly PROJECT_ROOT="$(git rev-parse --show-toplevel)"
readonly CLAIM_SPEC="$PROJECT_ROOT/docs/synova/research/CLAIM-TAG-SPEC.md"
readonly REGISTRY="$PROJECT_ROOT/docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v1.md"

cmd_help() {
  cat <<'EOF'
Usage: doc-audit [--check-claims <doc>] [--check-modified] [--help]
  --check-claims <doc>  验证单份文档的 <claim> 标签
  --check-modified      验证 git diff 中修改的文档
  --help                显示帮助
EOF
}

cmd_check_claims() {
  local doc="$1"
  echo "[DEGRADED] doc-audit Phase 0: interface only, implementation in Phase 3"
  echo "Would check: $doc for <claim> tags against evidence files"
  # Phase 3: grep <claim>, parse status/evidence, verify [ -f "$evidence" ]
  exit 0
}

cmd_check_modified() {
  local modified_docs
  modified_docs=$(git diff --name-only HEAD~1..HEAD | grep "docs/synova/research/权威文档" || true)
  if [ -z "$modified_docs" ]; then
    echo "[PASS] No authority docs modified in this commit"
    exit 0
  fi
  echo "[DEGRADED] Would check modified docs: $modified_docs"
  exit 0
}

# CLI 入口
case "${1:---help}" in
  --check-claims) shift; cmd_check_claims "$1" ;;
  --check-modified) cmd_check_modified ;;
  --help|*) cmd_help ;;
esac
```

### §3.5 K3 红队审计输入材料清单（交付物 4）

用户发给 Kimi App 的 7 项材料：

| # | 材料 | 路径 | 为什么 |
|---|------|------|--------|
| 1 | A线审计报告 | `docs/synova/research/A线-产品完整性缺口审计-20260801/` | 已知"文档 vs 代码现实"偏差 |
| 2 | 跨文档一致性审计 | `docs/synova/research/跨文档一致性审计-20260727/` | 已知文档间矛盾 |
| 3 | C线差距清单 | `docs/synova/research/C线-世界级基准-20260802/` | 外部对标偏差 |
| 4 | 17 份权威文档 | `docs/synova/research/权威文档01-17/` | 审计对象 |
| 5 | 控制塔状态 | `docs/synova/research/权威文档17-自诊断系统-20260729/V3-控制塔当前状态.md` | 控制塔自身盲区 |
| 6 | AGENTS.md | 项目根 | 铁律判案依据 |
| 7 | 研究总计划 | `docs/synova/research/SYNOVA-RESEARCH-世界级产品研究总计划-20260801.md` | 研究上下文 |

**K3 指令**（用户粘贴到 Kimi App）：

```
你是红队攻击者。你的目标：找到权威文档中"声称已实现但实际没实现"的盲区。

已知事实（直接作为判案依据，不质疑）：
- A线审计：四条件 C 仅 62%，文档声称更高
- 跨文档审计：已发现多处矛盾
- 控制塔：12 组 pre-commit 有已知盲区

任务：
1. 读 17 份文档的"已实现/已接线/已验证"声明
2. 对照 A线数据，找出文档声称 > 代码现实 的偏差
3. 找出文档间相互引用但版本不一致的矛盾
4. 找出"文档声称适用所有场景，但实际有边界限制"的盲区

输出：AUTHORITY-DEVIATION-REGISTRY-v1.md
只列 P0（必须修复）和 P1（建议修复）。
```

### §3.6 测试验证

**测试文件**：`tests/control-tower/claim-tag-spec.test.sh`

```bash
#!/bin/bash
set -euo pipefail

FAIL=0
PASS=0

assert_exit() {
  local expected="$1"
  local actual="$2"
  local msg="$3"
  if [ "$expected" -eq "$actual" ]; then
    PASS=$((PASS+1))
    echo "  ✓ $msg"
  else
    FAIL=$((FAIL+1))
    echo "  ✗ $msg (expected $expected, got $actual)"
  fi
}

echo "=== Test: claim-tag-spec validation ==="

# T1: doc-audit-interface.sh 语法正确
bash -n scripts/control-tower/doc-audit-interface.sh
assert_exit 0 $? "doc-audit-interface.sh syntax valid"

# T2: doc-audit --help 可执行
output=$(bash scripts/control-tower/doc-audit-interface.sh --help 2>&1)
assert_exit 0 $? "doc-audit --help runs"

# T3: doc-audit --check-modified 在无可修改文档时通过
output=$(bash scripts/control-tower/doc-audit-interface.sh --check-modified 2>&1)
if echo "$output" | grep -q "PASS"; then
  assert_exit 0 0 "--check-modified with no changes returns PASS"
else
  assert_exit 0 1 "--check-modified with no changes returns PASS"
fi

# T4: CLAIM-TAG-SPEC.md 存在且非空
[ -s "docs/synova/research/CLAIM-TAG-SPEC.md" ]
assert_exit 0 $? "CLAIM-TAG-SPEC.md exists and non-empty"

# T5: 规范中包含 status 枚举
grep -q 'status="IMPLEMENTED"' docs/synova/research/CLAIM-TAG-SPEC.md
grep -q 'status="PARTIAL"' docs/synova/research/CLAIM-TAG-SPEC.md
assert_exit 0 $? "CLAIM-TAG-SPEC contains status enums"

echo ""
echo "结果: $PASS 通过 / $FAIL 失败"
exit "$FAIL"
```

## §4 验收标准

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | 5 个交付物全部落盘 | `ls` 确认路径存在 |
| 2 | `doc-audit-interface.sh` 可执行且语法正确 | `bash -n` + `--help` |
| 3 | `CLAIM-TAG-SPEC.md` 包含完整 `<claim>` 标签格式定义 | grep 确认 `status`、`evidence`、`gap` 字段 |
| 4 | K3 输入材料清单完整，用户可直接发给 Kimi App | 清单 7 项，每项有路径和说明 |
| 5 | 测试脚本覆盖正常路径 + 降级路径 | `bash tests/control-tower/claim-tag-spec.test.sh` 全绿 |
| 6 | 旧文档策略明确：不迁移，只注册表管理 | 文档中明确声明 |

## §5 降级处理

| 场景 | 降级行为 | 标记 |
|------|---------|------|
| `doc-audit` Phase 0 未实现 | 输出 `[DEGRADED]`，exit 0（不阻断） | degraded: true |
| 旧文档无 `<claim>` 标签 | 不报错，只警告 | degraded: true |
| Python/bash 环境不可用 | 依赖项降级为手动 grep | degraded: true |
| K3 审计材料不全 | 基于已有材料做部分审计，缺失项标注 [DEGRADED] | degraded: true |

## §6 Done 标准

```
- [ ] DS1 交付物全部落盘（5 个文件）— verify: 
      ls docs/plans/codex/implementation/SYNOVA-AUDIT-AUTHORITY-v1-20260812.md && \
      ls docs/synova/research/CLAIM-TAG-SPEC.md && \
      ls scripts/control-tower/doc-audit-interface.sh && \
      ls docs/synova/coordination/K3-AUDIT-MATERIALS.md && \
      ls tests/control-tower/claim-tag-spec.test.sh

- [ ] DS2 doc-audit 脚本语法正确、可执行 — verify: 
      bash -n scripts/control-tower/doc-audit-interface.sh && \
      bash scripts/control-tower/doc-audit-interface.sh --help

- [ ] DS3 CLAIM-TAG-SPEC 包含完整格式定义（status/evidence/gap/since）— verify: 
      grep -E 'status=|evidence=|gap=|since=' docs/synova/research/CLAIM-TAG-SPEC.md

- [ ] DS4 K3 输入材料清单完整，可直接发给 Kimi App — verify: 
      wc -l docs/synova/coordination/K3-AUDIT-MATERIALS.md && \
      grep -c '材料' docs/synova/coordination/K3-AUDIT-MATERIALS.md

- [ ] DS5 测试脚本通过（正常路径 + 降级路径）— verify: 
      bash tests/control-tower/claim-tag-spec.test.sh && [ "$FAIL" = "0" ]

- [ ] DS6 旧文档策略明确：不迁移，只注册表管理 — verify: 
      grep "保持原样" docs/plans/codex/implementation/SYNOVA-AUDIT-AUTHORITY-v1-20260812.md
```
