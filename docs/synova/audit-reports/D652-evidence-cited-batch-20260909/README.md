# D652/D653/D657 Mac 质量第一批 — 实测证据落盘

> 任务: D652 evidence 入库铁律 + D653 合入即绿门禁 + D657 测试零副作用
> 日期: 2026-09-09 | 分支: feat/mac-quality-batch1 | 基线 HEAD: 93209c57（ssh/main）
> 执行: DeepSeek Harness（控制塔域, 创始人派工, K3 D651 C7/C2 失分点机制化修复）

## 1. D652 存量坏引用实测（legacy-bad-citations.txt）

- 生成命令: `bash scripts/control-tower/check-evidence-cited.sh --all`（@93209c57）
- 结果: **14 条坏引用**（exit 1），含 K3 D651 点名的 `task-state/D556.json → evidence/D556`、
  `task-state/D575.json → evidence/D575`
- 处置: **不溯及既往**（门禁只拦本次触碰条目）; 存量清单入列待各任务被触碰时补入库
  或改引用（D544 P1-2 修复方向）

## 2. D653 基线快照实测

- 生成命令: `CI=true npx vitest run --reporter=verbose`（@93209c57, Mac 本机）
- 结果: **5 个失败测试文件 / 23 条失败**（任务书口径 29 条系 K3 评估时点差异，
  D650/D651 合并后 main 前进）
  - tests/agent/expert-file-loader.integration.test.ts
  - tests/electron/use-streaming-conversation.test.ts
  - tests/expert/analytical-lens.test.ts
  - tests/l3/graphbridge-wiring.test.ts
  - tests/routes/diagnosis-report-persistence.test.ts
- 快照入库: tests/control-tower/main-red-baseline.txt（只减不增纪律见文件头注释）
- 真实回归: 全量输出喂 `check-main-green.sh --from-log` → MAIN-GREEN-OK（23 红全在基线）;
  注入假红 → 点名 + 待办 + exit 1

## 3. D657 测试污染实测（K3 失分点复现）

- 复现: CI=true 全量 vitest run 后 `git status`:
  - ` M extensions/industries/saas-tech/thresholds.json`（**tracked 真实行业配置**,
    aggregatedAt 2026-08-09 → 测试运行时刻, 写入方 packages/evolution global-analyzer
    writeIndustryThresholds）
  - ` M extensions/industries/test-write/thresholds.json`
- heartbeat.json 形态: 主仓多个 worktree 存在残留（.synova-wt-d575/.codex/heartbeat.json 等,
  写入方 src/loops/loop-scheduler.ts HEARTBEAT_DIR=cwd/.codex）; 本机 CI 口径未触发,
  防御性纳入白名单
- 修复: vitest.config.ts globalSetup(tests/global-setup.ts 快照+白名单恢复) +
  test.env.SYNOVA_DATA_DIR→mktemp（src/config.ts:103 消费, 不改 src/）
- 验收: 全量 vitest run 后 git status 零污染（本目录同 commit 的交付报告附第二次全量实测输出）

## 4. 测试与接线

- tests/control-tower/check-evidence-cited.test.sh: 9 检查全绿（正常/缺失/无引用/降级/边界/接线）
- tests/control-tower/check-main-green.test.sh: 13 检查全绿（正常/缺失/豁免/降级/from-log/self-check/24h/接线）
- tests/zero-side-effect.test.ts: 10 用例全绿（正常/边界/降级）
- 接线: pre-commit 组 14（D652）/ 组 15（D653 self-check）SYNO_CI=1 硬阻断实测
  （SYNO_TEST_ARM 注入 task-state/D575.json → ❌ 点名 exit 1）;
  ci.yml canary 清单 +2 / test job 失败分支 --from-log 退出码透传; YAML 语法 node js-yaml 验证通过
