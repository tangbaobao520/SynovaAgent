<!-- SYNOVA-IMPL-D260 v1.0 | 2026-07-29 | V3 Phase 1 P0 — 流水线健康度 -->
# SynovaAgent -- D260 V3 P0 流水线健康度（视图1）v1.0
> V3 §一: 4个检查点(CP1-CP4), 三行摘要, 条件代码区域映射表

## V3 权威文档引用
> §1.2 四个检查点: CP1(研究产出后) / CP2(DevDoc产出后) / CP3(Claude Code提交后) / CP4(审计完成后)
> §1.3 用户看到三行摘要: Research Agent / Dev Doc Agent / Claude Code 各一行
> §1.4 构建: hook-block-write.sh + pre-doc-audit.sh + pre-commit-check.sh G10/G11 + generate-dashboard.py
> §1.5 条件代码区域映射表: .codex/criteria-code-map.json

## 代码验证
- hook-block-write.sh: 当前 7 字段检查, 无 CRITERIA 验证 ❌
- pre-doc-audit.sh: 当前仅环境基线+任务特定检查, 无条件归属+验收覆盖+引用有效性 ❌
- pre-commit-check.sh: 当前 9 组(含D257 G9), 无 G10(条件区域)/G11(测试覆盖) ❌
- generate-dashboard.py: `render_html()` + `collect_dashboard_data()` 存在 ✅
- scripts/control-tower/views/ 目录不存在 ❌

## Q0-Q4
Q0: V3 P0——4个 Agent 交接点自动检查, 创始人不需看代码就能判断流水线健康。
Q2: 做——hook-block-write.sh 新增第8字段 CRITERIA 验证; pre-doc-audit.sh 扩展条件归属+验收覆盖+引用有效性; pre-commit-check.sh 新增 G10(条件区域)+G11(测试覆盖); 新建 views/pipeline_health.py 读 4 检查点 JSON 渲染三行摘要; 新建 .codex/criteria-code-map.json。不做——CP4 审计联动(需 D256 dispatch 稳定后), generate-dashboard.py 路由改造(归 D261)。
Q3: 提交→hook-block-write 检查 CRITERIA→pre-doc-audit 检查验收覆盖→pre-commit G10/G11 检查代码区域→pipeline_health.py 渲染摘要→generate-dashboard.py 导入
Q4: bash -n 全部 shell + Python 语法检查。L1 手动×4。

## 改动 (5 文件修改 + 2 新文件)

### 1. scripts/workflow/hook-block-write.sh — 新增条件归属验证 (~15行)
在现有 7 字段检查后追加第 8 字段:
```bash
# V3 CP1: CRITERIA 条件归属验证
CRITERIA=$(grep -oP '#CRITERIA\s*[:=]\s*\K[A-D]' "$TASK_BRIEF" 2>/dev/null || true)
if [ -z "$CRITERIA" ]; then
  echo "[V3-CP1] 缺少 #CRITERIA 条件归属(A/B/C/D) — 标记为 pending"
  # 不阻断——标记 pending, 允许继续但降级
fi
```

### 2. scripts/pre-doc-audit.sh — 扩展审计范围 (~30行)
在现有检查后追加:
- 条件归属验证: 读 task brief 的 `#CRITERIA` 字段
- 验收标准覆盖: 读 task brief 的 `## Done 标准` 节, 检查是否有端到端路径描述
- 引用有效性: grep 权威文档路径, 检查文件是否存在

### 3. scripts/pre-commit-check.sh — 新增 G10/G11 (~40行)
G10 (条件区域检查): 读 `.codex/criteria-code-map.json`, 比对 staged 文件 vs 条件代码区域
G11 (测试覆盖检查): 读 task brief 声明的验收标准, 检查 staged tests 是否覆盖端到端路径

### 4. scripts/control-tower/views/pipeline_health.py — **新建** (~60行)
CP1/CP2/CP3 检查点输出 JSON → `render_health(data)` → 三行 HTML 摘要 (green/yellow/red)

### 5. .codex/criteria-code-map.json — **新建** (V3 §1.5)
条件 A/B/C/D → 代码文件列表映射

## 测试 (L1 手动×4)
| # | 测试 | 验证 |
|---|------|------|
| 1 | bash -n hook-block-write.sh + pre-doc-audit.sh | 语法 |
| 2 | pre-commit 添加 G10/G11, bash -n 通过 | 语法 |
| 3 | python views/pipeline_health.py 导入成功 | 语法 |
| 4 | .codex/criteria-code-map.json valid JSON | 格式 |

## 完成标准
CP1/CP2/CP3 检查点就绪, 三行摘要视图可渲染。全部 bash -n + Python 语法通过。
