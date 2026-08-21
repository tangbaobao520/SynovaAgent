# GS-03 资本循环场景

> 数据: erp-standard | 哨兵: cash-runway | 验收点: 4-5 / 5-2 / 4-7
> 对应 C线标准: S1-1 / S1-4（财务循环）

## 场景

注入 erp-standard 财务数据（低现金 + 高月耗）→ 触发 cash-runway 哨兵 → 断言阈值告警。

预期（依赖落地后）：`现金余额 3万 / 月消耗 12万 = 0.25 个月 < critical 6` → 触发 critical「现金流危急」。

## 运行

```bash
bash scripts/golden-scenarios/GS-03-capital-cycle/run.sh
```

- exit 0 = 全部断言通过（场景绿）
- exit 1 = 有断言失败（证据 JSON 记明细）

## 断言（3 条）

| # | id | 类型 | 内容 |
|---|----|------|------|
| 1 | erp-upload-ok | 正常 | 上传响应含 Financial（数据注入成功） |
| 2 | cash-runway-critical-triggered | 正常 | 触发响应含「现金流危急」（阈值告警） |
| 3 | no-false-critical-zero-runway | 负向 | 触发响应不含「跑道0.0个月」（降级不误报） |

## 当前状态：✅ 全绿（2026-08-21 实测，evidence/GS-03-2026-08-21.json，verdict=pass，exit 0）

3/3 断言通过：注入成功（Financial 节点）→ 越阈触发 critical「现金流危急—跑道0.3个月」→ 无「跑道0.0个月」误报。

**从诚实 RED 转绿的修复链（2026-08-21，D462 环境修复 + run.sh 修复）**：

1. **better-sqlite3 v11.10.0 → v12.11.1（Node 24 兼容）**：v11 的 `Statement::~Statement()` 在 Node 24 下
   `Assertion failed: (env) != nullptr` 必然崩溃（WiseLibs/better-sqlite3#1376）→ 服务起不来，
   `file is not a database` 是同一阻塞链的次生症状。升级后服务稳定。
2. **run.sh 三修复**（对齐 GS-05 模式）：① JWT 自举（bootstrap 强制 DEV_MODE=false → upload 需鉴权）；
   ② `export SYNOVA_DB_PATH=$DATA_DIR/synova.db`（防开发者 env 泄漏写真实库，铁律 0-4）；
   ③ bootstrap 后台拉起 + 轮询 state（bootstrap.ts 起服务后进程不退出，命令替换会挂起）。
3. D355（cashBalance↔cash 对齐）+ D453（runSentinelOnce db:undefined）已入 main → 阈值告警链路完整。

历史（2026-08-18 诚实 RED 记录）：D355 对齐未入 main + D453 触发 bug 未修时，断言 2 RED。

## 红线

- 断言只认产品物理输出（文件内容），机器判定 exit 0/1，禁止恒真/空壳。
- 证据只入 git（evidence/GS-03-<date>.json），不靠「我记得跑过」。
- 场景脚本 = Harness 代码 → 进 K3 审计范围，无豁免。
