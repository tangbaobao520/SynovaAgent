# SynovaAgent -- D212 Dev Doc Gatekeeper Python 重写 实施方案 v1.0

> 2026-07-22 | D206 bash 版本在 Windows 上乱码不可用
> **控制塔 5 组件并行部署 — 第 5/5 项。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/dev-doc-gatekeeper.sh` 存在（9KB，bash）；D206 dev doc 存在
- [x] Get-Content 读取：D206 dev doc C1-C5 检查定义 — Edge ID 存在性 / 文件路径存在性 / Test Requirements 章节 / Wiring Verification 章节 / Authority Doc Verification 章节
- [x] Select-String 验证：D206 C1 `grep -oP 'E-\d{2}'` → 提取 Edge ID 正则；C2 `grep -oP '(src|extensions|packages|app)/\S+'` → 提取文件路径正则
- [x] 引用 — D206 已完成标准："C1-C5 全部 5 项检查，任一 FAIL → 阻断分发"

---

## 问题根因

D206 bash 脚本在 Windows PowerShell 中读取为乱码（UTF-8 编码被管道截断），无法执行。需重写为 Python 版本，确保在 Windows 和 Linux 上均可用。核心逻辑已在 2026-07-22 审计中验证可用——只需正式化部署。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 文档门禁 Python 版。替换乱码的 bash 脚本，实现 C1-C5 5 项机械验证。在 dev doc 分发到 Claude Code 前运行，任一 FAIL → 拒绝分发。

### Q1：调研
- D206 C1：提取 doc 中所有 E-XX → 逐条 grep 代码库验证存在性
- D206 C2：提取 doc 中 src/extensions/packages/app 路径 → Test-Path 验证存在性
- D206 C3：检查 doc 包含 "Test Requirements" + L1 引用
- D206 C4：检查 doc 包含 "Wiring Verification" + 调用方路径
- D206 C5：检查 doc 包含 "Authority Doc Verification" + 来源路径
- 已验证：Python 版在 2026-07-22 审计中成功运行（3 份文档 C1-C5 通过）

### Q2：范围
- 最小：`dev-doc-gatekeeper.py <path-to-dev-doc.md>` — 输出 PASS/FAIL/C1-C5 明细，退出码 0=PASS 1=FAIL 2=DEGRADED
- 不做：不删除 dev-doc-gatekeeper.sh（保留作为后备）

### Q3：验收
- 入口：`python dev-doc-gatekeeper.py docs/plans/codex/implementation/SYNOVA-IMPL-D8f-xxx.md`
- 交互：C1-C5 逐项检查 → 输出 PASS/FAIL 列表
- 结果：全 PASS → 退出码 0；任一 FAIL → 退出码 1

### Q4：契约与测试
- @input：dev doc Markdown 文件路径
- @output：验证报告（C1-C5 逐项 PASS/FAIL + 明细）
- @degraded：dev doc 不存在 → 退出码 2 + 告警
- 测试：全 PASS doc(1) + FAIL doc(1) + 不存在 doc(1) + 空 doc(1) = 4 tests

---

## 构建内容

### 1. scripts/control-tower/dev-doc-gatekeeper.py（新建，约 180 行）

基于已验证的 Python 逻辑，正式化封装：

```python
class DevDocGatekeeper:
  def check_c1_edge_ids(content: str) -> CheckResult
  def check_c2_file_paths(content: str) -> CheckResult
  def check_c3_test_requirements(content: str) -> CheckResult
  def check_c4_wiring_verification(content: str) -> CheckResult
  def check_c5_authority_doc(content: str) -> CheckResult
  def validate(doc_path: str) -> GatekeeperReport

class CheckResult:
  passed: bool
  label: str       # "C1: Edge ID existence"
  message: str     # "PASS: 3/3 verified" or "FAIL: E-99 not found"
  severity: str    # "PASS" | "FAIL" | "SKIP"
```

### 2. 测试文件（tests/control-tower/test-dev-doc-gatekeeper.py，约 80 行）

> ⚠️ 前置步骤：`tests/control-tower/` 目录尚不存在，需执行 `mkdir tests\control-tower` 或由脚本自动创建。

使用真实 dev doc 作为输入，验证 C1-C5 检查正确性。

---

## 不做什么

- 不删除 dev-doc-gatekeeper.sh（保留作为 Linux 后备）
- 不修改 C1-C5 检查逻辑（与 bash 版一致）
- 不添加新的检查项（未来版本扩展）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- D8f dev doc 输入 → ALL PASS（C1 SKIP, C2 SKIP/PASS, C3-C5 PASS）
- 含不存在 Edge ID 的假 doc → C1 FAIL
- 含不存在路径的假 doc → C2 FAIL
- doc 文件不存在 → 退出码 2 + 告警
- 4 个测试

### L2a：接线测试
- `python dev-doc-gatekeeper.py --help` 退出码 0
- dev doc 在分发前必须通过 gatekeeper（流程规定，非代码强制）

---

## 接线验证（铁律 4）

| 组件 | 触发方式 | 验证方式 |
|------|------|------|
| dev-doc-gatekeeper.py | 开发者分发 dev doc 前手工运行 | `python dev-doc-gatekeeper.py --help` |
| D206 dev doc | 定义 gatekeeper 标准 | 权威文档引用 |

---

## 完成标准

```
[ ] tests/control-tower/ 目录已创建
[ ] dev-doc-gatekeeper.py: C1-C5 5 个检查函数
[ ] C1: Edge ID grep 验证（支持 SKIP 无 Edge ID 场景）
[ ] C2: 文件路径 Test-Path 验证（支持 SKIP 无路径场景）
[ ] C3: Test Requirements + L1 引用检测
[ ] C4: Wiring Verification + 路径引用检测
[ ] C5: Authority Doc Verification + 来源路径检测
[ ] 退出码 0=PASS / 1=FAIL / 2=DEGRADED
[ ] ≥4 个测试
[ ] python dev-doc-gatekeeper.py --help 退出码 0

---

## 权威文档引用

- D206 dev doc：[SYNOVA-IMPL-D206-dev-doc-gatekeeper-v1-20260722.md](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D206-dev-doc-gatekeeper-v1-20260722.md)
- AGENTS.md Iron Law 0-5 错误 #1（不读权威文档）、#2（不引用测试规范）、#3（不写接线要求）
- AGENTS.md 铁律 0-3（写开发文档前必须阅读权威文档原文）


