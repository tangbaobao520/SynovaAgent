# 证据保鲜流水线（D774）：一键重跑 + 兑换 + 7 天定时 + 过期预警

> 状态: implemented | 日期: 2026-09-15 | 任务: D774 | 相关 D#: D589（stale 重验先例）、D734（PR 预算）、D758（证据目录域豁免）
> 决策: 证据保鲜做成编排器（rerun-evidence.sh 串联既有件），不做判分修改器；TTL/失效规则冻结；预警只派生不改判
> 理由: calc-progress.py:67 TTL=14 天 + :33 modules 变更即失效——不重跑则任何验收成果 14 天归零（09-15 实测 164 点中 29 stale）。保鲜 ≠ 改判分（编码指令硬约束）

## 一、交付四件（缺一不可）

1. **一键重跑** `scripts/product-lines/rerun-evidence.sh`：
   GS-01~08 逐项（单项失败不中断，exit code+原因进汇总）+ 线1 vitest（tests/electron/ 全套，
   点映射 = D589 先例 1-1/1-3/1-4/1-5/1-6/1-7）+ A2 套件 + 诚实 skip 清单（1-2 Win 真机、
   1-8 K3 复核——禁止自我审计）。三态退出（0/1/2，D328）。`SYNO_RERUN_*` 环境注入缝
   （测试零真实仓库写入）。
2. **兑换链路**：跑完自动 refresh-all + 打印前后六态对照（stale↓ / pending_k3↑）。
   防失真：`SYNO_A2_SKIP_WRITE=1` 关闭 refresh 内嵌 A2 的无条件 pass 写入（该环节是
   --skip-vitest 形态未真跑测试，此前会写恒 pass 证据 = 假绿风险，D774 顺手加固）。
3. **7 天定时**：DSH 任务看板定时任务 `D774 证据保鲜：一键重跑`（工作区 SynovaAgent、
   workspace-write、每 7 天）——TTL 的一半留审计窗口。README 记任务名+手动触发。
4. **过期预警** `scripts/product-lines/gen-expiry-warnings.py`（A9，接进 refresh-all 末步）：
   派生 `evidence-expiry.json`（expired/expiring 两清单，线×点×过期日），只预警不改判分。

## 二、关键设计裁决（为什么不那样做）

- **不建 GS→产品点映射**：GS 场景证据验收点 id（L1-x/S0-x）与 product-lines.yaml 点 id（1-x）
  体系断裂，calc 消费不到 GS 证据——这是**既有缺口**（场景侧 id 体系），无机器可读真值表。
  编造映射 = M2 假绿。如实登记：重跑保 GS 场景证据新鲜（GSS 契约目录），产品点兑换走
  线1 vitest + A2 套件（D589 已验证的映射）。修断裂需另立任务（属 GS 场景归属，非本域）。
- **判分规则冻结**：calc-progress.py 一行未动（含 CT-62 at 时间戳语义）。预警是独立派生文件，
  calc 不读它。
- **幂等实现**：GS 证据同日同名覆盖（assert.ts 契约）；线1/A2 写证据前查同日同
  type+verdict+points+source 去重（连跑两次零新增文件）。
- **A2 加固最小面**：run-machine-evidence.sh 只加两处——SYNO_A2_SKIP_WRITE 逃生说明 +
  同日去重；不动其 CI 语义（CI 前置跑过 vitest 的假设保留）。

## 三、踩坑记录（免疫细胞）

- **D370 在新代码复发**：`$gs_note）`（全角括号紧贴变量）→ unbound variable 崩在 fresh
  正常路径。修法 = `$var` 紧贴非 ASCII 一律 `${var}`（16 处批量修复）。ctrl-tower-change
  模式 2 早有警告——写新脚本后应跑「紧贴扫描」，建议后续常驻（D771 类）。
- **bash 数组空参陷阱**：`bash "$SCRIPT" "$ARGS"` 在 ARGS 空时传一个空串参数（命中脚本
  `*` 分支 exit 2）。修法 = `args=(); [ -n ... ] && args=($X); ${args[@]+"${args[@]}"}`。

## 四、验收证据

- 测试：tests/control-tower/rerun-evidence.test.sh 37 断言全绿（T1 全绿/T2 部分 fail 反向/
  T3 环境缺失降级/T4 幂等/T5 fail 优先/T6 接线 + 预警三态冒烟）
- 真实重跑：GS-01~08 + 线1 vitest（173 tests 绿）→ 前后六态对照见 PR 描述
- PR 布局：PR1 机制（本 Note + 脚本 + 测试 + README + brief + task-state，≤12 文件）；
  PR2 机器生成证据（GS×8 + test×2 + 汇总，≤12 文件）——进度刷新产物（progress.json/html/
  todos.yaml）留 CI bot 通道（product-progress.yml 既有机制）
