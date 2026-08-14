# SynovaAgent -- D219 全局集成 + 门禁自动判定 实施方案 v1.0

> 2026-07-25 | 附录 A v2.0 §三-四
> **创建 check-gates-v2.py — 17 门禁 30 秒自动判定脚本。仪表盘门禁面板的数据源。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：附录 A v2.0 存在，`scripts/agent-start.sh` 存在（D217），`packages/ontology/src/node-types.ts` 存在
- [x] Get-Content 读取：附录 A §三 — "Python 脚本扫描代码库、读取信号文件、运行端到端 curl，30 秒内自动判定。空壳检测：`return\s*\{\s*\}` / `throw new Error('Not implemented')`。依赖链降级。脚本自身健康检查——预期路径不存在 → 标记无法判定。" 附录 A §四 — 输出 gate-status.json：gates[] 含 id/name/dimension/status/conditions/details，summary 含 passed/partial/failed/unverifiable/weightedProgress
- [x] Select-String 验证：当前 `agent-start.sh` 有 3 步启动——无门禁检查步骤。`.codex/signals/gate-status.json` 不存在
- [x] 引用 — 附录 A §一.1："17 门禁 x 6 维度，当前 6 通过 / 7 部分通过 / 4 未通过"

---

## 问题根因

附录 A 定义了 17 门禁的自动判定标准，但 `check-gates-v2.py` 脚本从未实现。仪表盘门禁面板因此永远显示"无门禁数据"。D220 的 `read_gate_status()` 读取 `gate-status.json`——但这个文件无人生成。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 全局集成 — 门禁自动判定脚本。Python CLI `check-gates-v2.py` → 扫描 17 门禁 → 30 秒内输出 `gate-status.json` → D220 仪表盘门禁面板从此有数据。同时更新 `agent-start.sh` 在启动时可选运行门禁检查。

### Q1：调研
- 附录 A §一：17 门禁分为 6 维度（基础/接入/诊断/导航/持续运行/进化/控制），当前 6PASS/7PARTIAL/4FAIL
- 附录 A §二：每个门禁精确到文件名/函数名/字段名的通过条件。空壳检测：`return {}` / `throw new Error('Not implemented')` / 函数体<20 字符
- 附录 A §三：31 条预期路径清单——脚本启动时逐条 test-path。缺失 → 标记"无法判定"而非"失败"
- 附录 A §四：输出 JSON 格式——gates[] + summary + healthCheck + scanDurationMs + scriptVersion

### Q2：范围
- 最小：`scripts/audit/check-gates-v2.py` — 17 门禁逐条判定 → 输出 gate-status.json。Gate 0（启动自检）用 `npm start` 检测，其余 16 门禁用静态文件扫描
- 不做：不修改 D220 仪表盘（已读 gate-status.json）、不修改 agent-start.sh 核心逻辑（仅追加可选步骤）

### Q3：验收
- 入口：`python scripts/audit/check-gates-v2.py` → 30 秒内输出 `.codex/signals/gate-status.json`
- 交互：仪表盘 5 分钟后自动读取新数据 → 门禁面板从"无门禁数据"变为显示 17 行 pass/partial/fail
- 结果：summary.passed ≥ 6（与附录 A v2.0 评估一致）

### Q4：契约与测试
- @input：代码库文件系统 + `.codex/signals/` + `.codex/audit/` + GraphStore
- @output：`.codex/signals/gate-status.json`（附录 A §四格式）
- @degraded：预期路径缺失 → 该门禁标记 unverifiable → 不阻止其他判定
- 测试：门禁判定输出格式正确(1) + Gate 1 文件扫描通过(1) + Gate 7 方向监测判定为 fail(1) + 依赖降级逻辑(1) = 4 tests

---

## 构建内容

### 1. scripts/audit/check-gates-v2.py（新建，约 300 行）

```python
class GateChecker:
  EXPECTED_PATHS = [...] # 31 条附录 A 预期路径清单
  DEPENDENCY_MATRIX = {1:[2], 5:[8], 8:[9], 4:[12], 12:[13]}

  def check_gate_0_product_startup(self) -> GateResult: ...
  def check_gate_1_enterprise_registration(self) -> GateResult: ...
  # ... 17 gates

  def check_all(self) -> GateReport:
    # 1. 自身健康检查（31 条路径 test-path）
    # 2. 逐门禁判定（Gate 0 用进程启动，Gate 1-16 用静态扫描）
    # 3. 应用依赖链降级
    # 4. 计算 weightedProgress（pass=1.0, partial=0.5, fail=0.0）
    # 5. 写入 gate-status.json

  def write_report(self, report, output_path): ...
```

**Gate 判定方式：**
| Gate | 判定方式 | 关键检查 |
|------|---------|---------|
| 0 | 进程启动 | `npm start` → curl healthz |
| 1 | 静态扫描 | enterprise.ts 含 register 路由 + bcrypt.hash |
| 3 | 静态扫描 | src/connectors/ 含 fetch()/axios 调用 |
| 7 | 静态扫描 | src/ 含 direction 业务逻辑 |
| 13 | 静态扫描 | loop-scheduler.ts 含 silence/stagnation |
| 16 | 信号文件 | .codex/signals/ 6 文件存在性 |
| 其余 | 静态扫描 | 文件存在 + 函数签名 grep |

### 2. 修改 scripts/agent-start.sh — 追加可选门禁检查（5 行）

```bash
# Step 0 (optional): 门禁自检
if [ -f "scripts/audit/check-gates-v2.py" ]; then
  echo "[0/4] 门禁检查..."
  python scripts/audit/check-gates-v2.py --quiet && echo "  门禁报告已更新" || echo "  [WARN] 门禁检查失败"
fi
```

---

## 不做什么

- 不修改 D220 仪表盘
- 不实现 Gate 3/7/13 的业务逻辑（那是 D221/D222/D223 的任务）
- 不修改附录 A 的判定标准

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 输出 gate-status.json 含 gates[] + summary + healthCheck + scanDurationMs
- Gate 1 判定通过（enterprise.ts + bcrypt 都存在）
- Gate 7 判定为 fail（零业务代码）
- 依赖降级：Gate 8 从 partial 降为 partial（Gate 5 partial→Gate 8 降级）
- 4 个测试

---

## 完成标准

```
[ ] check-gates-v2.py: 17 门禁全部可判定
[ ] 31 条预期路径健康检查
[ ] 空壳检测: return {} / throw NotImpl / 函数体<20 字符
[ ] 依赖链降级: Gate 1→2 / 5→8 / 8→9 / 4→12 / 12→13
[ ] 输出 gate-status.json 符合附录 A §四格式
[ ] 30 秒内完成扫描
[ ] agent-start.sh 追加可选门禁检查步骤
[ ] ≥4 个测试
```
