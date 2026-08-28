# Note: resolve-commit-brief 认领候选日期窗口 ±1 天（D559，CT-46 连带）

> 状态: proposed（落地后 git mv 到 implemented/）| 2026-08-29 | dsh-cto
> 关联: D559 / CT-46 / V5.2.7 / PR #295

## 决策
resolver 的"今日 brief"过滤（today_files_by_prefix/suffix）从「仅今日」扩为「±1 天窗口」（DATES/DATES_C 由 python 计算；失败回落原语义=仅今日）。

## 依据（D333 四步）
1. 第一性原理: 文件名日期是"创建日"事实；CI runner 用 UTC 而文件名用 UTC+8——跨时区事实不因 runner 而变，认领机制不应以 runner 时钟裁定 brief 有效性。
2. 工程基线: D506 已有时区容差先例（±1 天窗口）。
3. 实证: PR #295 CI 红——D559 brief（08-29 北京）对 UTC runner 是"明天"→ 认领被排除 → resolver 回退认领同文件的 D541 陈旧 brief（架构层为空）→ 6 字段红。
4. 收敛: 窗口 ±1 天、认领计数不变、D317 回退不变（fail-closed 不削弱）；配对测试 17 断言（场景 5 明日胜出 / 场景 6 today-2 排除）。

## 待办
合并后 git mv 本文件到 implemented/。
