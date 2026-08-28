# Task Brief: D544 左栏验收合并

## Q0: 定位
### a) 项目拼图
D544 = D538 左栏 Codex 风格实现（910 行躺 feat/d538-frontend-leftbar）的验收合并任务：设计 §六 8 条验收逐条核 + 章1 测试实跑 + 章3 接线断言 + merge main + PR/CI。L1 桌面端品牌表层（electron-renderer），零架构位变更。
### b) 文件审计
D538 实现增量 10 文件：electron-renderer/src/components/LeftPanel.tsx、RightPanel.tsx、electron-renderer/src/stores/capability.ts、app-store.ts、electron-renderer/src/styles/global.css、electron-renderer/package.json、package-lock.json、tests/electron/capability.test.ts、task-state/D544.json、.claude/bypass.log（auto hook）。merge main 后 CI diff 模式（base...HEAD）含全部实现文件，需本 brief 认领（CI G12 实证：brief 缺失时 resolver 回退模板 brief → 7 处越界）。
### c) 决策
D538 实现已存在 → 验收不重写实现；缺口按 spec 章5 分级（小项直修/大项停手报 CTO）；GA 校准接口不存在 → 占位不伪造。

## Q1: 调研
a) 业界最佳实践: Anthropic 工程基线——fail-closed（红 CI 不合并）+ 物理证据优先（每条声称对应 grep/测试输出）。
b) 顶级团队做法: 合并判据 = PR CI check-runs（本地绿不算）；接线断言只认生产调用点（S-3，测试调用不计）。
c) memory 历史教训: D316 dev doc 声称不实 → 全程实测留痕；接线失败 4 次（铁律 0-2）→ 章3 生产调用点断言；D334 merge main 后再 PR；D502/D506 本地绿≠CI 绿（本轮 5 次 CI 实证再现，根因=brief 未入库 + resolver 回退，CTO 日志定位）。

## Q2: 范围
做什么:
- LeftPanel.tsx — DS3 emoji Lucide 化（💬/📁/🏢 → MessageSquare/Folder/Building2）+ D538 能力导航实现随 merge 入 diff
- RightPanel.tsx — D538 右栏 selectedCap 联动 + 四详情组件（随 merge 入 diff，本 brief 认领）
- app-store.ts — D538 selectedCap/setSelectedCap（随 merge 入 diff，本 brief 认领）
- capability.ts — D538 纯逻辑契约（随 merge 入 diff，本 brief 认领）
- global.css — D538 .cap-* 样式（随 merge 入 diff，本 brief 认领）
- electron-renderer/package.json — lucide-react 1.34.0 依赖（随 merge 入 diff，本 brief 认领；D552 收窄路径防裸 basename 误伤 dsh/plugins/synova-dashboards/package.json）
- electron-renderer/package-lock.json — lock 重生成（随 merge 入 diff，本 brief 认领；D552 同款收窄）
- capability.test.ts — 23 用例纯逻辑测试（随 merge 入 diff，本 brief 认领）
- D544.json — task-state 回填 impl 段 + status=impl_done
不做什么:
- 不改 src/routes/sentinel.ts — 后端 3 接口只读消费（派单红线）
- 不改 src/routes/loops.ts — 后端接口只读消费
- 不改 src/routes/actions-api.ts — 后端接口只读消费
- 不改 scripts/audit/AUDIT-PROTOCOL.md — K3 审计脚本红线（永不碰）
- 不改 scripts/pre-commit-check.sh — 门禁脚本归控制塔线
- 不改 ci.yml — CI 配置归控制塔线

## Q3: 验收
入口: .wt-d544 worktree（origin/feat/d538-frontend-leftbar 基线）按 D544 spec 章1 实跑
处理: 章2 八条标注 + 章3 grep 断言 + DS3 小修 + 章4 merge main 解冲突（D538.json 取 main 侧）→ push → CI
结果: CI check-runs 全绿（npm audit 黄灯豁免除外）→ PR 建 → 交 CTO 复验点合并

## 架构层: L1 桌面端（electron-renderer）
## Done 标准:
- [x] 章1 三步全绿（npm ci exit 0 / tsc --noEmit exit 0 / vitest 23/23）— 已实测含 DS3 后与 merge 后复跑
- [x] 章2 八条标注全通过 + 章3 断言全命中 — evidence/D544/chapter2-acceptance.md、chapter3-wiring.md 落盘
- [x] DS3 emoji=0 + merge 冲突面符合 spec §8 预测 — 5e0b2723/2667c5fd/6795598c 三个 merge commit
- [x] 分支已 push（pre-push 0-5 全过）+ evidence 7 件落盘 — origin/feat/d544-leftbar-acceptance
- [ ] CI check-runs 全绿 + PR 建立 — brief 入库修复后待本轮 CI 复跑确认
