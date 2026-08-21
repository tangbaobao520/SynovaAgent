# GS-08 报告可读场景（D449）

> 场景: GS-01 诊断产物 → 一页纸报告 + 移动端可读
> 前置: 报告模板（K3 定稿）✅（已在 main: extensions/reports/{default,executive-summary}.hbs + src/l3/report-template-loader.ts）
> 归属: scripts/golden-scenarios/ → DeepSeek Harness（进审计无豁免）

## 断言契约（3 条，机器判定）

| # | 断言 | 类型 | 证明 |
|---|------|------|------|
| 1 | loadTemplate('executive-summary') → degraded=false | 正常 | 一页纸模板可加载（S8-1） |
| 2 | render 产物含 title/score/卡片 | 正常 | 一页纸渲染可读（S8-1） |
| 3 | listTemplates 含 executive-summary | 正常 | 模板注册可见（S8-2） |

## 诚实 RED 声明（2026-08-21）

- **本场景为模板契约级断言**：验证一页纸模板（executive-summary.hbs）的
  加载/渲染/注册三个物理契约。模板本身为移动端友好设计（max-width:700px
  响应式 + 卡片布局）。
- GS-01 产物 → 一页纸的**端到端管线**（诊断报告对象 → 模板渲染 → HTTP 交付）
  的渲染调用点仍待验证（report-assembler 与模板加载器的接线），列为后续增强。

## 运行

```bash
bash scripts/golden-scenarios/GS-08-report-readable/run.sh
# exit 0 = 3/3 断言通过；证据写 evidence/GS-08-<date>.json
```

## 验收（派单）

- [x] 场景脚本 + evidence JSON 进 git
- [x] 机器判定 exit 0/1
- [x] 诚实 RED 标注（契约级，非假绿）
