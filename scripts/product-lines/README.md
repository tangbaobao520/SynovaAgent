# scripts/product-lines/ — 产品完成度仪表盘脚本（D371, DeepSeek Harness）

> 依据: docs/plans/codex/strategy/SYNOVA-DESIGN-产品完成度仪表盘-v1-20260816.md（v1.4，创始人 2026-08-16 批准开工）
> 归属: TASK-ROUTING.md 已登记 `scripts/product-lines/ → 进行中·DeepSeek Harness·08-16`

## 一句话

把"产品 = 26 条能力线"写死，机器算进度，一页 HTML 给创始人看。**页面即真相：不推送、不摘要。**

## 文件清单与自动化 A1-A8 接线表

| 文件 | 职责 | 自动化 |
|------|------|--------|
| productline_yaml.py | 严格 YAML 子集解析器（零依赖，fail-closed；测试用 node-yaml 交叉验证） | — |
| calc-progress.py | 证据扫描 + 六态状态机 + 进度计算 | **A1**（git 惰性失效）+ **A4**（进度重算） |
| aggregate-todos.py | 5 源待办聚合 → todos.yaml | **A3**（周五 cron / 审计报告提交后） |
| gen-progress-page.py | 产品进度页生成（大白话 + 待裁决置顶区） | **A5**（页面生成）+ **A8**（待裁决置顶区） |
| evidence-writer.py | CI/场景结果 → 证据记录 | **A2**（机器验证入库） |
| parse-k3-report.py | 审计报告 JSON → 证据记录 | **A6**（降级路径先通：JSON 双轨 D347/D349 落地后切自动） |
| gen-k3-task.py | 线 100% / 每 2 周 → 审计复核任务书 | **A7** |
| refresh-all.sh | 本地/CI 一键：A3 → A4 → A5（+A9 预警） | A3+A4+A5+A9 串联 |
| rerun-evidence.sh | D774 证据保鲜流水线：一键重跑 GS-01~08 + 线1 vitest + A2 套件 → 新证据 → 自动 refresh + 前后六态对照 | **保鲜入口**（7 天定时） |
| gen-expiry-warnings.py | D774 过期预警：派生「已过期/将过期」清单（只预警不改判分） | **A9**（refresh-all 末步） |

## 数据流

```
product-lines.yaml（线定义，创始人可改）
        ↓
calc-progress.py ← evidence/*.json（审计结论/场景实测/自动测试/创始人核验）
        ↓              ↑ evidence-writer.py（A2）/ parse-k3-report.py（A6）
product-progress.json
        ↓
gen-progress-page.py ← todos.yaml（aggregate-todos.py 从 5 源聚合，A3）
        ↓              ↑ cockpit-override.yaml（待裁决，A8 源）
product-progress.html ← 创始人打开即见
```

## 触发方式

- **本地**：`bash scripts/product-lines/refresh-all.sh`
- **CI 自动**：`.github/workflows/product-progress.yml` —— push main（合并事件= A1 失效检测）+
  每周五 09:00 UTC + 手动触发；产物有变化 → 自动开 PR（bot 分支，创始人点合并）
- **审计任务书**：`python3 scripts/product-lines/gen-k3-task.py`（线 100% / 每 2 周，A7）

## 证据保鲜流水线（D774，2026-09-16）

**为什么**：证据 TTL 14 天（calc-progress.py:67）+ 证据日期后 modules 有变更即失效（:33）——
不重跑，任何验收成果 14 天后归零（09-15 实测 164 点中 29 stale）。保鲜 ≠ 改判分：判分规则冻结。

**用法**：
```bash
bash scripts/product-lines/rerun-evidence.sh               # 全量（GS 场景 + 线1 vitest + A2 + 自动刷新）
bash scripts/product-lines/rerun-evidence.sh --skip-gs     # 跳过 GS 场景（调试）
bash scripts/product-lines/rerun-evidence.sh --no-refresh  # 只跑不刷新（测试）
```
- 三态退出：`0` 全绿 / `1` 有显式 fail（逐项 exit code 进汇总，绝不静默）/ `2` 降级
  （vitest 不可用等环境缺失——不写失真证据，fail-closed）
- 幂等：连跑两次零新增证据文件、汇总结论一致（GS 同日覆盖 + 线1/A2 同日同源去重）
- 汇总落 `docs/synova/product-lines/rerun-evidence-summary-<date>.json`（fresh/fail/skip/degraded 逐项）
- 诚实 skip：1-2（Win 真机安装）、1-8 等 K3 复核点——机器不可代验/禁止自我审计，不伪造
- 已知缺口：GS 场景证据的验收点 id（L1-x/S0-x）与 yaml 点 id（1-x）体系断裂，calc 消费不到
  GS 证据——重跑保 GS 场景自身证据新鲜，产品点兑换走线1 vitest + A2 套件（详见 D774 Note）

**7 天定时任务**（TTL 14 天的一半，留审计窗口）：
- 通道：DSH 任务看板定时任务，任务名 `D774 证据保鲜：一键重跑`，每 7 天一次（周三 10:00），
  权限 `workspace-write`
- ⚠ 已知限制（2026-09-16 实测）：经 API/CLI 创建的任务在触发时报「目标工作区已不存在 /
  agent without inject」——workspaceRegistry 只认 GUI 注册的工作区 id，API 侧无法绑定——
  **需在任务看板 GUI 里以同名参数重建一次**（GUI 创建自带工作区+预设绑定）。重建后本节无需再改。
- 手动触发：看板任务卡「立即运行」；或命令行直接 `bash scripts/product-lines/rerun-evidence.sh`（等效）
- 定时任务只产出证据与汇总 + 刷新本地进度文件；提交进 git 仍走 PR（bot 通道 = CI product-progress）

**过期预警**（A9，每次 refresh 末步自动生成）：
- `docs/synova/product-lines/evidence-expiry.json`：`expired`（已过 TTL）/ `expiring`（剩余 ≤7 天）
  两张清单（线 × 点 × 过期日），供仪表盘读取；**只预警不改判分**

## 红线（与设计 v1.4 一致）

1. **只有带证据的验收点才算已验证**——yaml 里标 verified 但无证据记录 → 自动降为未开始并告警。
2. **线到 100% 必须审计员全量复核**（k3_gate），开发者自报 100% 无效。
3. **证据只入 git**（docs/synova/product-lines/evidence/），不靠"我记得跑过"。
4. 本目录全部脚本 = Harness 代码 → **进审计范围，无豁免**（MULTI-AGENT-COLLAB 红线 3）。
5. 页面语言大白话：页面自有文案零 D#/P0/P1/K3 术语（scrub 映射自动执行）。
