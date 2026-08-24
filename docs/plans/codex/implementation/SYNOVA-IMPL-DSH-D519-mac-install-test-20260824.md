---
north-star:
  服务用户: FDE + 创始人——"双平台承诺"必须有一侧被真机证明，而不是 CI 绿灯的自我安慰
  服务场景: 开发者在 Mac 本机打 dmg → 安装到 /Applications → 双击启动 → 看到首诊页，全程有日志与哈希留痕，K3 可独立复跑
  模块终态: `scripts/desktop/mac-install-verify.sh` 一键完成"打 dmg→安装→启动→断言→落 evidence→清理"，founder-demo checklist 4 步可执行
  对齐北星: PRODUCT-BRIEF §二（FDE 拿到的是能装的 Mac 包）+ §六 P0（不能给 FDE 用的一切都不算数）
  完成标准: evidence/ 含 dmg 的 ls+md5+挂载+安装+启动日志+进程/窗口断言原文；mac-install-verify.sh 退出码 0；founder-demo checklist 每步有命令
  当前进度: 零——无实测脚本、无 evidence、无 founder-demo 路径（D510 遗留 DS11 补做）
---

<!--
  SYNOVA-IMPL-DSH-D519: L1-A Mac 安装包实测（验证点 1-3）
  状态: dev doc | 2026-08-24 | 优先级 P1 | slice: L1-A
  权威: 派单-L1切片A §D519（4 必答题）+ D510 审计遗留 DS11（founder-demo 补做）+ D510 F1（物理实测禁模拟）
  依赖: D517（dmg 产物）+ D518（入口收敛）；D504 已合入 main（ea89dee9）
  并行: 无（串行第三棒；scripts/desktop/ 新领地独占）
-->

# D519: L1-A Mac 安装包实测（1-3）

> 一句话问题: 「Mac 版安装包可用」至今没有任何一次真实安装记录——没有脚本、没有 evidence、没有 founder-demo 路径；双平台承诺只有 Mac 侧能本机证明，这个证明还不存在。

## 1. Authority Doc Verification

- **派单**: `docs/synova/coordination/派单-L1切片A-D517-D519-20260824.md` §D519（4 必答题，明确"物理实测，非模拟"）
- **审计遗留**: D510 审计（来源: 派单 §上一轮教训）——DS11 founder-demo 未做的补做路径
- **教训**: D510 F1 静态 grep 冒充实测（来源: 派单 §上一轮教训加粗）——本任务全部 Done 标准物理命令断言
- **铁律**: AGENTS.md 铁律 0-2（入口→交互→结果三环节）/ 4 / 35（能 check-*.sh 的不靠 review）

## 2. Problem Statement

验证点 1-3「Mac 版安装包可用」uncommitted。缺三块: ① 可复现的实测脚本（打 dmg→hdiutil 挂载→cp /Applications→open→断言进程/窗口/healthz→清理）; ② evidence 落盘规范（ls+md5+启动日志原文进 task-state.evidence）; ③ founder-demo checklist（D510 遗留 DS11：dmg 产出→安装→启动→首诊 4 步每步命令）。Win 侧（1-2）不在本任务。

## 3. Q0-Q4

**Q0 拼图**: L1 桌面端验证基建。新建 scripts/desktop/ 领地（现有 scripts/ 无 desktop/ 子目录，实测 `ls scripts/` 确认）。复用 D517 构建链产物。
**Q1 调研**: 业界=Electron 官方分发验证模式（hdiutil 挂载 dmg + cp -R 到 /Applications + open + osascript System Events 进程/窗口断言——macOS CI 自动化标准做法，参考 appium/macos-notch 等项目 smoke test）；Anthropic=机器可验+证据原文落盘（不转述）；memory=D510 F1。**参考: macOS 官方工具链（hdiutil/osascript）+ Anthropic 机器可验 + 第一性原理（"能装"的最小证明=文件落盘+进程存活+窗口存在+服务健康四个物理事实）+ 结论：四断言脚本化。**
**Q2 范围**: 做什么——mac-install-verify.sh（全链含清理）、evidence 落盘、founder-demo checklist、干跑（--dry-run）模式。不做什么——Win 实测（1-2 切片 B/D521）、CI 上跑安装实测（GitHub macOS runner 无 GUI 会话，open/osascript 窗口断言不可靠——CI 只构建，实测只在本机）、自动更新、公证（随 D517 descope）。
**Q3 验收**: 入口=`bash scripts/desktop/mac-install-verify.sh`；处理=构建 dmg→挂载→安装→启动→四断言（进程 pgrep、窗口 osascript、healthz curl、首诊页可达）→落 evidence→退出回收+卸载清理；结果=退出码 0 + evidence/ 文件齐 + task-state 回填。
**Q4 契约与测试**: 见 §7。

## 4. Current State（2026-08-24 实测）

- `scripts/desktop/` **不存在**（实测）。`ls scripts/` 有 audit/control-tower/workflow/product-lines/backup 等，无 desktop。
- 构建产物链: D517 交付后 `release/*.dmg`（本机 `--mac`）可得。
- 后端健康端点: src/routes/healthz.ts:323 `GET /api/healthz`（实测存在，200=健康）。
- 首诊入口: `resources/renderer/index.html`（D518 收敛后 prod loadFile 目标）；API 侧 /api/diagnosis/consult（GS-01 三断言绿）。
- task-state evidence 惯例: task-state/*.json 的 impl/audit 段（TEMPLATE.json 结构，D518/D517 spec 均要求 evidence 原文回填）。
- **缺失**: 实测脚本 / evidence / founder-demo / 清理回收（防污染下次实测）。

## 5. What We Build

### 5.1 写集 (1 修改 + 3 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| .gitignore | 修改 | 追加 `evidence/`（实测产物大文件不入库，原文摘录进 task-state） |
| scripts/desktop/mac-install-verify.sh | 新建 | 契约: `mac-install-verify.sh [--dry-run] [--skip-build] [--keep-data]` → exit 0=四断言全过 / 1=任一断言失败 / 2=前置缺失（dmg/工具）degraded。步骤: ①(除非 --skip-build) D517 构建链打 dmg；②`ls -lh release/*.dmg` + `md5` 落 evidence；③`hdiutil attach -nobrowse -readonly` 挂载→`cp -R` 到 /Applications（覆盖前提示）；④`open -a /Applications/SynovaAgent.app`；⑤轮询 60s 四断言: `pgrep -f SynovaAgent`、`osascript -e 'tell app "System Events" to (name of processes) contains "SynovaAgent"'`、`curl -sf localhost:18790/api/healthz`、后端日志（~/Library/Application Support/SynovaAgent/logs/backend.log）非空；⑥evidence 落 `evidence/D519-mac-<date>/`（dmg-ls.txt/md5.txt/mount.log/backend.log/window.txt）；⑦清理: kill 进程 + `hdiutil detach` + 删除 /Applications/SynovaAgent.app（userData 默认同删，--keep-data 保留）；⑧--dry-run 只打印步骤不断言。失败路径 echo 具体失败步 + evidence 记录（不静默） |
| docs/synova/runbooks/founder-demo-mac.md | 新建 | D510 遗留 DS11 补做: 4 步 checklist——1) 打 dmg（命令+预期产物 ls/md5）2) 安装（挂载+cp 命令）3) 启动（open+预期进程/窗口断言命令）4) 首诊页可达（healthz+renderer 截图路径）；每步"证据落哪"标注 task-state.evidence 字段名 |
| tests/electron/mac-install-verify.test.ts | 新建 | L1 单元: 脚本存在+可执行（stat mode）、含四断言关键字（pgrep/osascript/healthz/detach）、--dry-run/--keep-data 参数解析分支存在、exit 语义注释与实现一致（grep 断言，属脚本契约静态测试——**不替代本机实跑**，DS1 仍需物理实测） |

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| Win 侧实测（1-2） | 派单明确归切片 B/D521；本任务验收口径="Mac 实测过 + Win 构建产物存在（D517 CI artifact）" |
| CI 跑安装实测 | macOS runner 无交互 GUI 会话，osascript 窗口断言不可靠——CI 只构建（D517），实测本机 |
| 公证/签名验证 | 随 D517 descope（无证书）；runbook 记录右键打开 |
| 改 electron/ 任何文件 | D518 领地已收敛，本任务纯验证侧 |
| scripts/audit/ | K3 专属红线 |

## 7. Test Requirements

**契约（铁律 47）**: mac-install-verify.sh → exit {0=全过,1=断言失败,2=前置缺失}；任何失败路径 echo 具体失败步 + evidence 记录（不静默，铁律 24）。

| 层 | 用例 | red 前提 |
|:---|------|------|
| L1 单元 | 脚本契约静态断言（存在/可执行/四断言关键字/exit 语义注释） | 脚本创建前红 |
| L2a 接线 | `--skip-build` 消费 D517 产物: 无 dmg 时 exit 2 + 提示（前置缺失路径） | 无 dmg 环境实测 |
| L2b 降级 | 伪造断言失败（PATH 注入假 pgrep 或临时改 SERVER_URL 为死端口）→ exit 1 + evidence 含失败步记录 | 注入复现 |
| L2c 边界 | 重复运行（上次残留进程/app）→ 脚本先清理再装（幂等）；--keep-data 保留 userData | 连跑两次复现 |

**verify 命令（物理实测，唯一权威）**:
```bash
bash scripts/desktop/mac-install-verify.sh; echo "exit=$?"   # 期望 exit=0
npx vitest run tests/electron/mac-install-verify.test.ts
ls evidence/D519-mac-*/   # 六类证据文件齐
```

## 8. Wiring Verification

| 新产物 | 生产调用点（实测方法） |
|--------|------|
| mac-install-verify.sh | founder-demo-mac.md 第 1-4 步全部引用该脚本子命令/步骤；切片 A 总览 §三验证点 1-3 判据=本脚本 exit 0 |
| founder-demo checklist | task-state/D519.json impl 段 evidence 字段按 checklist 字段名回填（一一对应） |
| mac-install-verify.test.ts | `npx vitest run tests/electron/` 全组（D504 存量+D517+本任务）回归 |

## 9. Architecture Layer

L1 交互层验证基建（不进运行时链路）。脚本只消费产物+HTTP 探活，零跨层。

## 10. Completion Standard

1. **DS1**: 本机 `bash scripts/desktop/mac-install-verify.sh` 退出码 0——四断言全过（进程+窗口+healthz+日志），**物理实测非模拟**（D510 F1 红线）
2. **DS2**: evidence/D519-mac-*/ 含 dmg-ls.txt、md5.txt、mount.log、backend.log、window.txt 原文；关键摘录（md5、healthz 响应、窗口断言输出）回填 task-state/D519.json
3. **DS3**: `npx vitest run tests/electron/mac-install-verify.test.ts` 全绿（含 L2b 注入失败用例）
4. **DS4**: founder-demo-mac.md 4 步 checklist 每步含命令+预期+证据落点（D510 遗留 DS11 闭环）
5. **DS5**: 幂等复跑通过（连续两次 exit 0，第二次走清理路径）；`--dry-run` 输出步骤清单
6. **DS6**: 双平台承诺验收口径落档: Mac=本任务 DS1 实测 + Win=D517 CI artifact 下载证据（URL/截图进 task-state）
7. **DS7**: 写集外零改动 + scripts/audit/ 零触碰

> DS1-DS7 逐项标注，禁静默缺项（S-10）。

## 11. Auth Doc References

- docs/synova/coordination/派单-L1切片A-D517-D519-20260824.md
- docs/synova/coordination/切片A总览-L1-D517-D519-20260824.md
- .claude/PRODUCT-BRIEF.md（§二/§六）
- AGENTS.md（铁律 0-2/4/24/35/47/48）

## 12. 自检清单（dev-doc 侧，K3 可核）

- [x] 派单 4 必答题逐条覆盖（①实测步骤脚本=写集 mac-install-verify.sh 八步 ②founder-demo checklist=写集+DS4 ③Win 侧明确不做=§6 ④双平台验收口径=DS6）
- [x] 四断言全部物理命令（pgrep/osascript/curl/日志非空），脚本 exit 语义 0/1/2 契约化（铁律 47）
- [x] scripts/desktop/ 不存在已实测（新领地无冲突）；healthz 端点 src/routes/healthz.ts:323 实测存在
- [x] 清理回收+幂等（--keep-data/--dry-run）入 L2c 边界用例——防实测污染开发者本机
- [x] evidence 不入库（.gitignore）+ 原文摘录进 task-state——大文件不进 git
- [x] 写集 4 条目；不碰 electron/（D518 领地）、src/、scripts/audit/
- [x] gatekeeper exit 0（C1-C6）
- [x] 依赖声明: D517 产物 + D518 入口收敛
