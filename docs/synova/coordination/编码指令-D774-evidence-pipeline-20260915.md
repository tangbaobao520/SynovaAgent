# 编码指令 — D774 证据保鲜流水线（一键重跑 + 兑换 + TTL 定时 + 过期预警）

> 生成: 2026-09-15 | 执行方: **并行 CTO session（预设 `synova-cto`）** | 域: **mac**（`scripts/product-lines/**` + `scripts/golden-scenarios/**`）
> 依据: `派单-第五批-产品推进-20260915.md` §三 B 组（**本批前置机制**）
> 为什么必须先做: `scripts/product-lines/calc-progress.py:67` `EVIDENCE_TTL_DAYS=14` + `:33`（证据日期后该线代码变更即失效）→ 不重跑，A/D 组的成果两周后又归零

## 一、先读
- `scripts/golden-scenarios/README.md`（GS 场景 = 证据工厂；断言规范；三态语义）
- `scripts/product-lines/calc-progress.py`（六态与失效规则；`stale` 的两个来源）
- `scripts/product-lines/refresh-all.sh`、`docs/synova/product-lines/evidence/`（证据落点与 schema）
- `task-state/D774.json`

## 二、做什么（四件，缺一不可）
1. **一键重跑**：新增 `scripts/product-lines/rerun-evidence.sh`（或等价，名字自定但要写进 README）
   - 覆盖：GS-01~GS-08（`scripts/golden-scenarios/GS-*/`）+ 线 1 的机器可验项 + 其他已脚本化的验收
   - 幂等；失败**不中断全局**（逐项记录 exit code 与原因到汇总）
   - 输出：新证据文件（`evidence-writer` 契约）+ 一份汇总（哪些点 fresh / fail / skip）
   - 注入缝：环境变量覆盖证据输出目录（供测试，不许写真实 `docs/`）
2. **兑换链路**：跑完自动 `bash scripts/product-lines/refresh-all.sh`，并打印**刷新前后** `product-progress.json` 的六态计数对照（stale↓ / pending_k3↑）
3. **TTL 定时重跑**：每 **7 天**一次（TTL 14 天的一半，留审计窗口）——用看板定时任务通道创建（工作区 `SynovaAgent`、权限 `workspace-write`），并在 README 记录任务名与手动触发方式
4. **过期预警**：`product-progress.json` 增加/派生一份「14 天内将过期 / 已过期」清单（线 × 点 × 过期日），供仪表盘读取；**不改成失败态**（只预警）

## 三、硬约束
- **不动** `calc-progress.py` 的 TTL 与失效规则（不为凑数字放宽；D774 是"保鲜"，不是"改判分"）
- 测试：新增 `tests/control-tower/rerun-evidence.test.sh`（或等价）+ 覆盖三态（全绿 / 部分 fail / 环境缺失降级），注入缝零真实仓库写入（`SYNO_*` 环境变量）
- 脚本遵循 `PLATFORM-CHECKLIST.md`（禁裸 `python3`、`date +%s`、`grep -P`；UTF-8 头块；三态退出码）
- 写集机器生成；单域 mac；PR ≤12 文件；提交走 `synova-commit`
- 改了 `scripts/product-lines/**` → 需 Note（`memory/notes/`）并在 commit message 引用

## 四、验收（可证伪）
- [ ] `bash scripts/product-lines/rerun-evidence.sh`（或等价）跑完 → 证据目录出现新文件，汇总打印 fresh/fail/skip
- [ ] 幂等：连跑两次，第二次不产生重复垃圾、结论一致
- [ ] 定时任务在看板可见（贴任务名与下次运行时间）；手动触发一次成功
- [ ] 过期预警清单可读（贴前 5 行）
- [ ] 刷新前后六态对照表贴进 PR（stale 数下降）
- [ ] 反向验证：故意让一个场景失败 → 汇总里显式 fail + 非零退出（不静默吞）

**开始吧。**
