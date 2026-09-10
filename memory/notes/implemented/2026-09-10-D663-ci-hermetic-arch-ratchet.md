---
状态: implemented
日期: 2026-09-10
决策: CI 常红根治双修——① 密封测试身份自持（沙箱 git commit 显式 -c user.name/email 注入；hooks-install 场景 5 清空继承的 bypass.log 恢复新机器语义；「全部 N 组通过」正则锚定替代组数硬编码）；② 架构棘轮如实重置（diagnosis.ts 2→4 + D593-FIX2 逆向例外记账头）+ check-architecture.sh 基线外新增逐条输出 file:line；③ decide-next.sh 架构探测 -x→-f（无可执行位不再误报「不存在」）；④ check-secrets.sh 全工作区扫描加 --exclude-dir 跳过 .sessions/.synova-wt-*（本地仓库副本 1GB+ 拖慢 grep -rn 递归 I/O，17.9s→0.72s，25 倍；fastlane <10s 断言本机恢复真实——原 18s 系扫描 I/O 假慢，非门禁语义回归；grep -v 后置过滤仅滤输出行不省扫描，必须用 --exclude-dir 跳读）
理由: CI 三红自 CT-64 起 main 永久红 = 零信号，D593-FIX2 的 +2 跨层违规藏于噪音入 main（CT-47 第三次实证）。CI 真因：ubuntu runner 零配置无 gecos fallback → "empty ident name"（Mac 本地被 fallback 掩盖，D316「环境依赖失败≠恒失败」同型）；ct-test-gate 红 = alloc 红级联（配对基线绿 exit 1）；hooks-install 红 = 宿主 bypass.log 当日记录泄漏进沙箱 + 12→13 组断言漂移（M7）。棘轮上调系 K3 D593-FIX2 复审（#478）CONDITIONAL PASS 条件①，收紧路径 = PLAN-diagnosis-l5-di。
---

## 背景

CI 三红（Control Tower ubuntu / Architecture / 旧 windows 矩阵）自 CT-64 起在 main 永久红。
永久红 = 零信号：D593 手术新增 2 处 L1→L5 藏在噪音里没被拦住。

CTO 实测根因（D663）：
1. `tests/control-tower/alloc-task-id.test.sh:96,109` 沙箱 `git commit` 依赖环境身份——
   CI ubuntu runner 零配置且 GECOS 为空 → `empty ident name`；Mac 本地 gecos/username
   fallback 有效所以绿（环境依赖型测试，D316 同型）。
2. `ct-test-gate.test.sh` CI 红 = 级联：「正常 3」场景以 alloc-task-id.test.sh 为配对基线绿，
   基线红 → 配对 exit 1 → ct-test-gate 红。同根，修 alloc 即愈。
3. `hooks-install.test.sh` 场景 5 双重根因（本机也红）：
   a. CLONE 继承 tracked `.claude/bypass.log`，宿主当日 detected-bypass 记录触发
      GATEKEEPER（本地模式）在沙箱阻断 → 「全部 N 组通过」永不出现（宿主状态泄漏 = 非密封）；
   b. 断言硬编码「全部 12 组通过」，V5.1.1 扩 13 组后锚点断裂（M7 版本锚点漂移）。
4. Architecture 红 = diagnosis.ts 实际 4 > 基线 2（D593-FIX2 #476 合并带入，PR 已披露）。
5. 顺带发现：`decide-next.sh:39` 用 `[ -x ]` 探测 check-architecture.sh，文件无可执行位
   → 每次 commit 建议面板误报「check-architecture.sh 不存在」（探测失真型噪音）。

## 决策

- **密封身份自持**：沙箱 git commit 显式 `git -c user.name=t -c user.email=t@t commit`
  （与 post-commit/synova-commit 测试同惯例）。同族 6 测试（bypass-union-merge /
  clone-shadow-commit / generated-gate / hooks-install / post-commit / synova-commit）
  逐一实测：均已沙箱内自配身份（local config / -c 注入），零配置模拟绿，不改。
- **沙箱宿主状态隔离**：hooks-install 场景 5 清空 CLONE 继承的 bypass.log
  （新机器模拟本应无绕过历史；不弱化 GATEKEEPER 门禁语义）。
- **断言解锚**：「全部 12 组通过」→ 正则 `全部 [0-9]+ 组通过`（组数增减不再断锚，
  「全过」信号语义不变）。
- **棘轮如实重置**：diagnosis.ts 2→4 + 逆向例外记账头（K3 #478 条件①），
  其余文件计数按实测核对无偏差；收紧任务 PLAN-diagnosis-l5-di 立项（owner=编码线）。
- **明细输出**：check-architecture.sh 基线外新增分支逐条列出违规 file:line
  （基线只记 file=count 无行号，超基线文件须人工核对全部命中行）。
- **探测修正**：decide-next.sh `[ -x ]` → `[ -f ]`。

## 验证

- 零配置模拟（GIT_CONFIG_NOSYSTEM=1 + GIT_CONFIG_GLOBAL=/dev/null + 清 ident 环境变量）
  8 测试全绿：alloc-task-id / bypass-union-merge / clone-shadow-commit / generated-gate /
  hooks-install / post-commit / synova-commit / ct-test-gate。
- SYNO_CI=1 bash scripts/check-architecture.sh = exit 0（重置后基线，main 将真绿）；
  注入旧基线（diagnosis.ts=2）复现红态，明细逐条列出 332/672/718/743。
- simulate-ci.test.sh 零断言削弱，级联消除后转绿。
- rules: 同类密封缺陷（宿主环境/状态泄漏进测试）修复模式 = 测试内显式自持，禁止依赖
  运行环境 fallback。
