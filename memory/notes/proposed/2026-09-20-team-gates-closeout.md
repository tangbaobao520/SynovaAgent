# 2026-09-20 门禁加固三卡小队（D846/D847/D848 + D849/D853）M6 收口

## 状态
proposed

## 决策/结论
1. **派单件先复核再派**：本轮派单件有 3 处失实（#657 声称已合实为 open、写集与在飞 D811 实体撞车、D846/D847 基线文件不在 main）——全部由 CTO 在开工前物理复核发现，未污染执行方。
2. **栈式 PR 遇上「必需检查 + PR 预算 12」会卡死**：#657 每加一件治理产物（卡/brief/note）就把 diff 顶过 12 → 必需检查红。本队两次（D849、D853）都靠"移出治理件、随 docs 提交单独走"化解，属治标，机制层需另立卡。
3. **独立自验必须"不采信"**：verifier-1 三轮共 8 项发现，其中 4 项（第一轮共享 tmp 崩溃、第二轮 degraded 断裂、第三轮回收 judge-then-unlink 竞态、第三轮注入缝毒值）K3 报告与编码自述里都没有；D847 的头部判据被自验证伪 → 卡的"完成"不等于"判据成立"。
4. **同类 fail-open 反复出现 → 按红线升级**：Windows 上认领制门禁整体静默 fail-open（起错 bash = WSL 桩 + claimed 空即跳过判定），且 CI 环境下 `synova-commit.test.sh` 断言 ② 两平台共有 `exit=0`。这是 M1（fail-open）+ M5（环境依赖门禁）的复发，已按"同类第二次 = 防线系统性失效"升级登记。

## 依据
- `docs/synova/coordination/小队交付-门禁加固三卡-20260920.md`（M6 三件 + 发现登记 F1–F12）
- `docs/synova/product-lines/evidence/D846-D847-自验-20260920.md`（自验三轮 972 行，8 项发现 + 12 条未覆盖面）
- CI 注解原文（PR #657 job `106094769626` ubuntu / `106094769667` windows）

## 影响面
`scripts/control-tower/{claim_release.py,write_lock.py,staging_guard.py,synova-commit}`、`scripts/workflow/resolve-commit-brief.sh`、`scripts/project/gen-project-board.py`、`.github/workflows/ci.yml`
