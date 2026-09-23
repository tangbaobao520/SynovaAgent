# 决策 Note — 第③面生成器修复（三处）

- 状态: proposed | 责任方: synova-cto | 日期: 2026-09-23
- 触发: 创始人「打开即真相」不成立；台账 2026-09-14 已记 P0 至今未修

## 三处修复（均为实测缺陷）

1. **`spec` 假定 dict** → 字符串卡（多数卡）触发 `AttributeError`，生成器整体崩溃（自 D600 起无法生成）。
2. **字符串 spec 全是路径的隐含假设** → 散文式 spec（D911/D821 等）被当路径 → `OSError: File name too long`。守卫：仅「短、单行、带扩展名」才视为路径，散文 → 无路径（不猜）。
3. **verdict 子串序 `PASS` 先于 `FAIL`** → 报告同时含二者（汇总表极常见）即误判 PASS（CTO-HEALTH.md:69 把 D393 的 FAIL 显示为 PASS）。新口径三步：**显式裁决行 > 无歧义子串 > 歧义即 `?`**（fail-closed，不伪装 PASS）。

## 证据

- 修前：`--dry-run` 崩溃；`gen-cto-health.test.sh` 与 `gen-cto-health-repro.test.sh` 在 **main 上均 FAIL**（存量）
- 修后：同一命令 **exit 0**；两测试 **均 PASS**（分支 vs main 对照实测）

## 影响

第③面（CTO 健康看板）恢复生成能力 + verdict 不再误报；创始人「打开即真相」的可信度恢复。属最高风险变更面（门禁/看板），受 K3 独立审计（无豁免）。
