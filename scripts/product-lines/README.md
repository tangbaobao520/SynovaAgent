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
| refresh-all.sh | 本地/CI 一键：A3 → A4 → A5 | A3+A4+A5 串联 |

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

## 红线（与设计 v1.4 一致）

1. **只有带证据的验收点才算已验证**——yaml 里标 verified 但无证据记录 → 自动降为未开始并告警。
2. **线到 100% 必须审计员全量复核**（k3_gate），开发者自报 100% 无效。
3. **证据只入 git**（docs/synova/product-lines/evidence/），不靠"我记得跑过"。
4. 本目录全部脚本 = Harness 代码 → **进审计范围，无豁免**（MULTI-AGENT-COLLAB 红线 3）。
5. 页面语言大白话：页面自有文案零 D#/P0/P1/K3 术语（scrub 映射自动执行）。
