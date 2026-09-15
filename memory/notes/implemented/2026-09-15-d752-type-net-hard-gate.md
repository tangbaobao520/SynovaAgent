# 哨兵类型网登记从软约束改硬门禁（D752）

> 状态: implemented | 日期: 2026-09-15 | 决策: 把 types.ts 静态 import type 的「类型网登记」从可加可不加的软约束改为 check 脚本硬门禁（缺失 exit 1 点名） | 理由: 院长质询「可插件化是否物理事实」→ 欠账登记 D752——实测 8/45 活跃哨兵未登记长期无人发现，佐证治理原则「软机制 0% 有效」

## 一、触发（院长质询欠账 D752，P1）

- 实测复现（worktree 2026-09-15）: 活跃哨兵 45（loader 口径）× types.ts 登记 38 → `comm -23` 差集 8 个未登记: cash-runway / competitive-moat / competitive-position / key-person-risk / path-dependency / revenue-health / sentinel-forecast-accuracy / sentinel-pricing-strategy
- 根因: 静态 `import type` 不加也能跑（运行时不依赖）→ 事实上没人执行 → D750 同族的「静默失效」

## 二、决策内容

| 决策点 | 选择 | 理由 |
|---|---|---|
| 豁免口径 | 与 sentinel-loader.ts L71-73 **同源**（shared / `_` 前缀归档 / 非目录条目不要求登记） | 单一事实源，不发明第二套豁免；归档不改名 = 门禁点名 → 倒逼归档动作显式化 |
| 登记判定 | types.ts 含 `extensions/sentinels/<name>/` 路径前缀（带尾斜杠） | path-dependency 的 entryPoint 特殊（computes/detect.ts 非 aggregate.ts），按目录前缀比按文件名稳；尾斜杠防 `revenue-health` 误匹配 `revenue-health-2` 类前缀碰撞 |
| CI 接线 | 经 vitest 集成测试（tests/sentinel/d752-type-net-gate.integration.test.ts 跑真实脚本子进程） | ci.yml 属本单红区不可改；vitest 全量步骤在 CI 自动跑 → 硬门禁上 CI 不等 ci.yml 变更 |
| 本地接线 | ct-test-gate（U7/CT-40）自动配对 | 配对规则 `scripts/control-tower/<name>.sh ↔ tests/control-tower/<name>.test.sh` 强制，pre-commit 自动跑配对测试 |
| 补登记 | 8 个全部补（不豁免） | 要么登记要么显式豁免——不许静默跳过（派单 §二-3） |

## 三、两个平台坑（实测踩中，供后续控制塔脚本复用）

1. **macOS bash 3.2 括号 case 模式**: `case "$x" in _*)` 在 bash 3.2 报 `syntax error near unexpected token ';;'`（bash ≥4 正常）。修法: 括号模式 `in (_*)`。
2. **无效 locale 字节解析错乱（本单最大坑）**: ct-test-gate `export LC_ALL=C.UTF-8` 在 macOS（无此 locale）下，bash 3.2 解析含中文的脚本会把多字节尾字节黏进下一个 token（实测: 变量名 `SENTINELS_DIR` 尾黏坏字节 → `unbound variable` → 门禁**假红**）。修法: 脚本头部 `export LC_ALL=C LANG=C`——本类脚本数据全 ASCII，C locale 字节级语义最稳，中文仅存在于 echo/注释原样字节透传。

## 四、验证（全部已贴原始输出）

- 复现: 门禁 exit 1 + 逐个点名 8 个
- 补登记后: exit 0 + 45 全登记
- 反向验证: 删 cash-runway 登记行 → exit 1 仅点名 cash-runway；恢复 → exit 0
- 双测试: bash 9 ✅ / vitest 4 passed；全量 tests/sentinel 918 passed | 1 skipped
- 关联: scripts/control-tower/check-sentinel-type-net.sh + tests/control-tower/check-sentinel-type-net.test.sh + tests/sentinel/d752-type-net-gate.integration.test.ts + src/sentinel/types.ts（仅补 8 行）
