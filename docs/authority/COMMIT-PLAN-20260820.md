# COMMIT-PLAN-20260820.md — 文档体系改革交付清单（待提交）

> 目的：本次文档体系改革（2026-08-19~20，DSH 执行）的全部变更，供开发线分批提交进 git。
> ⚠️ **未提交 = 未交付**（D315 教训）。门禁脚本改动需 **K3 审计复核**（D336 审计红线）。
> 前置：当前工作区 task brief 的 Q1b/Q2 为空导致组 6 阻断——提交前先补齐或新建 brief。

---

## 一、变更总览（建议分 4 批提交）

### 批次 1：文档体系（新建 + 修改，纯文档，低风险）

| 文件 | 类型 | 说明 |
|---|---|---|
| `CHRONICLE.md` / `INDEX.md` / `START-HERE.md` | 新建 | 编年史 / 导航总图 / 入职路径 |
| `docs/authority/`（9 文档 + chronicle-drafts×3） | 新建 | 权威层：PRD / ARCHITECTURE / STATUS / DOCS-REGISTRY / GOVERNANCE / DRIFT-LEDGER / SYSTEM-HEALTH / TASK-DRAFTS / TRIAGE-CLASSIFICATION / COMMIT-PLAN |
| `AGENTS.md` / `CLAUDE.md` | 修改 | +文档体系章节；CLAUDE 另有专家数/组数同步 ×9 处 |
| `LOOP.md` | 重写 | GBK→UTF-8 重编码 + V4.5.1 同步（13 组/版本） |
| `knowledge/shared/README.md` | 修改 | 8→7 位专家 |
| `docs/synova/DOCUMENT-INVENTORY.md` | 修改 | 2 行归档标注 |
| `docs/archive/TOMBSTONE-20260820.md` | 新建 | 归档墓碑 |

### 批次 2：治理脚本 + 测试（新建，独立可测）

| 文件 | 说明 |
|---|---|
| `scripts/doc-system/`（8 个） | 真相验证 / 登记门禁 / 过期标记 / 月报生成 / 一次性清理 / 九类索引 + 月报包装 + 定时安装器 |
| `tests/doc-system/`（6 个） | 测试套件（48 断言，含接线检查） |

### 批次 3：门禁接线（修改，**需 K3 审计**）

| 文件 | 说明 |
|---|---|
| `scripts/pre-commit-check.sh` | +附加文档门禁块 G14（真相验证 + 登记门禁，仅文档变更时触发） |
| `scripts/doc-system/doc-registry-gate.sh` | +staged 新增检查（untracked + git add 过都查） |

### 批次 4：归档移动（git 自动识别为 rename）

| 移动 | 说明 |
|---|---|
| `docs/08-代码审计报告-20260603.md` → `docs/archive/` | 任务 B 归档（无消费方，被 audit-reports 体系取代） |
| `docs/audit/REMEDIATION-PLAN-20260603.md` → `docs/archive/` | 任务 B 归档 |

## 二、验收命令（提交后跑）

```bash
bash scripts/doc-system/check-doc-truth.sh      # 全绿（exit 0）
bash tests/doc-system/check-doc-truth.test.sh   # 5/5
bash tests/doc-system/doc-registry-gate.test.sh # 8/8（含 git 模式 + 接线 W1/W2）
bash scripts/pre-commit-check.sh                # 门禁自过（先补当前 brief 的 Q1b/Q2）
```

## 三、K3 审计材料（门禁改动专项）

- **改动范围**：`scripts/pre-commit-check.sh` G14 附加块 + `doc-registry-gate.sh` staged 检查
- **契约**：见各脚本头注释（输入/输出/降级）+ `docs/authority/GOVERNANCE.md`
- **测试**：`tests/doc-system/doc-registry-gate.test.sh`（8 用例，含生产接线检查 W1/W2）
- **审计重点**：① G14 是否误拦（无文档变更时跳过，实测 ✅）② registry-gate 退出码三态（0/1，降级不静默）③ 中文变量边界（${VAR} 花括号）④ 计时 <1.5s（不拖慢门禁）

## 四、建议 task brief 模板（开发线复制即用）

```
## Q0: 定位 — 文档体系改革交付提交（DSH 2026-08-20 完成，开发线落地 git）
### a) 项目拼图
文档体系改革全部完成（编年史/权威层/6 机制/任务 A/B/C），本任务将其提交进 git。
### b) 文件审计
变更清单见 docs/authority/COMMIT-PLAN-20260820.md（4 批）。
### c) 决策
按 4 批提交；批次 3（门禁）过 K3 审计复核（D336）。

## Q1: 调研 — 历史教训
D315（改了必须提交）/ D336（门禁改动审计红线）/ V4.4.4（文档-代码漂移复发教训）。

## Q2: 范围 — 正确的最简方案
做什么：按 COMMIT-PLAN 4 批提交全部变更。
不做什么（含文件路径）：不动 docs/ 其余存量；不改历史档案库 D:\novis-backup-20260526\。

## Q3: 验收 — 入口 → 交互 → 结果
入口：git synova-commit
处理：分批提交（先补当前 brief Q1b/Q2）
结果：全部变更入库 + check-doc-truth 全绿 + pre-commit 自过 + K3 审计通过

## 架构层: L0（文档体系 + 门禁）
## Done 标准: 变更全部提交 + 真相验证全绿 + 门禁自过 + K3 审计通过
```

---

*本清单为交付执行依据；完成后在 TASK-DRAFTS.md 标记"已提交"。*
