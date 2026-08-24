---
north-star:
  服务用户: FDE（前线部署工程师）——不会装 Node、不想碰命令行，拿到一个安装包双击就能用
  服务场景: FDE 在自己电脑上安装 SynovaAgent 桌面端，作为 30 分钟首诊旅程的起点
  模块终态: `electron-builder` 一条命令产出双平台安装包（.dmg/.exe），CI push main 自动构建并上传 artifact，任何人可下载验证
  对齐北星: PRODUCT-BRIEF §二（直接用户=FDE）+ §六 P0（没有安装能力不能给 FDE 用）
  完成标准: 本地 `npx electron-builder --config build-synova.cjs --dir` → release/mac/SynovaAgent.app 存在+大小>100MB+CI artifact 可下载（物理产物，非 grep）
  当前进度: D504 已合 main（ea89dee9，审计 CP）——build-synova.cjs（extraResources renderer/dist/extensions）+ electron/package.json pack scripts 均已在 main；缺 mac zip target、CI 构建 job、构建链契约文档与产物物理断言测试
---

<!--
  SYNOVA-IMPL-DSH-D517: L1-A 安装包可产出（验证点 1-1）
  状态: dev doc | 2026-08-24 | 优先级 P1 | slice: L1-A
  权威: 派单-L1切片A §D517 + PRODUCT-BRIEF §二/六 + D510 审计 F1 教训（物理验证，禁 grep 冒充）
  依赖: D504 已合入 main（ea89dee9）——backend-spawn.cjs / build-synova.cjs extraResources / electron/package.json pack scripts 均在 main
  并行: 无（串行 D517→D518→D519，electron/ 领地独占）
-->

# D517: L1-A 安装包可产出（1-1）

> 一句话问题: 今天没有任何一条可复现的路径能打出一个"能装"的 SynovaAgent 安装包——build-synova.cjs 有配置骨架但无 CI、无 mac zip、无产物物理断言；FDE 拿不到安装包，桌面端 0/8。

## 1. Authority Doc Verification

- **派单**: `docs/synova/coordination/派单-L1切片A-D517-D519-20260824.md` §D517（4 必答题 + 验收）
- **产品北星**: `.claude/PRODUCT-BRIEF.md` §二（直接用户=FDE，缺系统诊断工具）+ §六 P0
- **审计教训**: `docs/synova/audit-reports/2026-08-23-D504-D505.md`（D504 写集 18 文件 K3 属实核验，本 spec 基线）+ D510 F1（禁止静态 grep 冒充实测——来源: 派单 §上一轮教训）
- **铁律**: AGENTS.md 铁律 0-2（接线验收）/ 4（交付不完整）/ 47/48（契约+非空壳测试）

## 2. Problem Statement

派单验证点 1-1「安装包能打出来」当前 uncommitted。缺口三块:
1. build-synova.cjs（D504 版）mac target 只有 dmg，无 zip（CI artifact/解包验证需要）；产物断言零测试。
2. 无 CI 构建 job——安装包产出不可复现，任何机器/任何人无法独立验证（K3 无法审"能打出来"）。
3. 构建链（root tsc → renderer vite build → electron-builder）顺序与产物路径无契约文档，先后顺序错了就打出空包。

## 3. Q0-Q4

**Q0 拼图**: L1 交互层桌面端。已有 electron/（主进程）+ electron-renderer/（React）+ build-synova.cjs（builder 配置）。本任务=补齐打包链最后一环（配置收口 + CI + 断言）。不新增产品代码。
**Q1 调研**: 业界=electron-builder 官方模式（config 文件 + files/extraResources 白名单 + mac dmg+zip 双 target 是 CI artifact 标准做法，参考 electron-builder docs、VS Code/Ant Others 桌面应用 CI 矩阵）；Anthropic 基线=机器可验契约（产物存在性+大小+CI 绿，非人肉口述）；memory 教训=D510 F1（声称"实测"实际静态 grep）。**参考: electron-builder 官方实践 + Anthropic 机器可验 + 第一性原理（产物是文件，存在性可物理断言）+ 结论：三层证据（本地产物/CI artifact/测试断言）。**
**Q2 范围**: 做什么——build-synova.cjs mac+zip、新建 CI workflow、产物断言测试、构建链契约注释。不做什么——src/（产品代码零改动）、自动更新 publish 配置（build-synova.cjs 中保持注释态，Phase 2）、Win 实测（D521）、代码签名/notarize（无证书，明确 descope 并在 dmg 打开警告的 runbook 说明，见 D519）、Linux AppImage（存量保留不动）。
**Q3 验收**: 入口=`npx electron-builder --config build-synova.cjs --dir`（本地）/ push main（CI）；处理=构建链三步顺序执行；结果=release/mac/SynovaAgent.app 物理存在 + du -sh 大小 + CI artifact 下载可得。
**Q4 契约与测试**: 见 §7。

## 4. Current State（2026-08-24 实测）

- `build-synova.cjs`（main 实测，D504 交付已在 main）: appId com.synova.agent / productName SynovaAgent / output release / files 白名单含 electron/{main,backend-spawn,preload}.cjs+config.json+icon.png / extraResources: dist→dist(!renderer)、dist/renderer→renderer、extensions→extensions / win nsis x64 / **mac 仅 dmg [x64,arm64]** / linux AppImage。
- `electron/package.json`（D504 版）: pack/pack:dir/pack:mac/pack:win scripts（cd .. 调根目录 config）。
- 根 `package.json`: electron-builder ^25.1.8 devDep + electron:build* scripts + build:"tsc"（tsconfig outDir ./dist，实测产物入口 dist/src/index.js——backend-spawn.cjs buildCommand 已按磁盘事实用 dist/src/index.js）。
- `electron-renderer/package.json`: build:"tsc && vite build"；vite.config.ts outDir `../dist/renderer`、base './'。
- CI: `.github/workflows/ci.yml` 无 electron 构建；product-progress.yml 只算进度。
- 测试: tests/electron/desktop-build.test.ts（D504 版 15 断言，静态为主）。
- **缺失**: mac zip target / CI desktop-build job / 产物物理断言（--dir 产物存在+大小）/ 构建链顺序契约。

## 5. What We Build

### 5.1 写集 (2 修改 + 2 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| build-synova.cjs | 修改 | ①mac target 改 `[{target:'dmg',arch:['x64','arm64']},{target:'zip',arch:['x64','arm64']}]`（zip 供 CI artifact 与解包验证）；②文件头注释补**构建链契约**: 步骤1 root `npm ci && npm run build`→dist/src/index.js，步骤2 `cd electron-renderer && npm ci && npm run build`→dist/renderer，步骤3 `npx electron-builder --config build-synova.cjs [--dir]`→release/；顺序错=空包（extraResources 引用 dist/dist/renderer） |
| .github/workflows/desktop-build.yml | 新建 | push main + workflow_dispatch 触发；matrix: macos-latest（dmg+zip）/ windows-latest（nsis）；步骤 checkout→node 20→root npm ci→npm run build→electron-renderer npm ci→npm run build→npx electron-builder（各平台原生构建，**不做 linux 交叉**）→actions/upload-artifact@v4 上传 release/（dmg/nsis/zip）；CI 无 GUI → 只构建不启动（启动实测归 D519 本机）；产物缺失步骤 fail（默认 exit 非 0 即红） |
| tests/electron/desktop-build.test.ts | 修改 | 增产物断言组: 若 release/mac 存在 → 断言 `SynovaAgent.app`（mac）或 `SynovaAgent-mac-*.dmg/.zip` 存在且 `fs.statSync().size > 100*1024*1024`；release/ 不存在时该组 skip 并 console.warn 标注（未构建环境不误报）；增 workflow YAML 解析断言（desktop-build.yml 含 matrix 两平台 + upload-artifact） |
| docs/synova/runbooks/desktop-build.md | 新建 | 构建链三步契约 + 本地 --dir/full 打包命令 + CI artifact 下载路径 + 未签名 dmg 的 Gatekeeper 警告说明（descope 代码签名，右键打开） |

## 6. What We Don't Do

| 不做 | 原因 |
|------|------|
| 改 src/ 任何文件 | 派单红线——首诊后端生产可用 |
| electron/main.cjs / backend-spawn.cjs | D518 领地（本任务只动打包配置） |
| publish/自动更新配置 | build-synova.cjs 注释态 Phase 2 |
| 代码签名 + notarize | 无 Apple 开发者证书；unnotarized dmg 首次打开需右键——runbook 记录，创始人有证书后再做 |
| Win 本机实测 | 验证点 1-2，切片 B/D521 |
| Linux 构建 CI | 存量 AppImage 配置保留，不加 CI job |

## 7. Test Requirements

**契约（铁律 47）**: 构建产物契约 = 给定 dist/ 与 dist/renderer/ 已构建，`electron-builder --config build-synova.cjs --dir` 必产 `release/mac/SynovaAgent.app`；full 构建必产 `release/*.dmg` + `release/*.zip`（mac）/ `release/*.exe`（win, CI）。

| 层 | 用例 | red 前提 |
|:---|------|------|
| L1 单元 | desktop-build.test.ts: mac target 含 dmg+zip 双 target（读 build-synova.cjs 断言）；files 白名单含 backend-spawn.cjs；extraResources 三条映射存在 | 修改 target 前红（当前仅 dmg） |
| L1 单元 | workflow 断言: desktop-build.yml 存在 + 含 macos/windows matrix + upload-artifact | 新建前红 |
| L2a 接线 | 构建链实测（red=构建顺序颠倒时 extraResources 空打包）: 删 dist/renderer 后打包 → 测试断言 resources/renderer/index.html 不存在 → 证明契约真实约束 | 手册 red 演示一次，落 runbook |
| L2b 降级 | release/ 不存在 → 产物断言组 skip + console.warn（不误报不静默） | 删 release/ 目录复现 |
| L2c 边界 | 产物 size 断言阈值 100MB（Electron 运行时+dist+renderer 下限）；zip<10KB=空包红 | 注入假 zip 复现 |

**verify 命令（物理，非 grep）**:
```bash
npx electron-builder --config build-synova.cjs --dir && \
  test -d release/mac/SynovaAgent.app && \
  test "$(du -sm release/mac/SynovaAgent.app | cut -f1)" -gt 100 && echo D517-DS1-PASS
npx vitest run tests/electron/desktop-build.test.ts   # DS2
```

## 8. Wiring Verification

| 新产物 | 生产调用点（实测方法） |
|--------|------|
| build-synova.cjs 配置 | `grep -n "build-synova" package.json electron/package.json` → electron:build*/pack* scripts（≥5 处）真实引用 |
| desktop-build.yml | GitHub Actions push main 自动触发 + workflow_dispatch 手动可跑（合并后首个 push 即为接线证据） |
| runbook | 派单/切片 A 总览 §二依赖图引用 docs/synova/runbooks/desktop-build.md |

## 9. Architecture Layer

L1 交互层（Electron 打包=分发形态）。零跨层——构建配置不 import 任何层；CI 属工程基建非运行时代码。

## 10. Completion Standard

1. **DS1**: 本地 `npx electron-builder --config build-synova.cjs --dir` 产 `release/mac/SynovaAgent.app`，`du -sm` > 100（产物存在+大小物理证据，禁止 grep 配置冒充——D510 F1）
2. **DS2**: `npx vitest run tests/electron/desktop-build.test.ts` 全绿（含新断言组；red 已证）
3. **DS3**: full 构建 `--mac` 产 release/*.dmg + *.zip；CI desktop-build job 绿（mac+win 两 job）且 artifact 可下载（截图/URL 落完成报告）
4. **DS4**: 构建链契约三步写入 build-synova.cjs 头注释 + runbook（步骤颠倒=空包有 L2a 演示）
5. **DS5**: 写集外零文件改动（`git diff --name-only` 对账）；src/ 与 scripts/audit/ 零触碰
6. **DS6**: task-state/D517.json 回填 impl + evidence（DS1 产物 ls+du 输出原文）

> 交付声明覆盖 DS1-DS6 逐项标注 ✅/⏸/❌+理由，禁重编号/静默缺项（S-10）。

## 11. Auth Doc References

- docs/synova/coordination/派单-L1切片A-D517-D519-20260824.md
- docs/synova/coordination/切片A总览-L1-D517-D519-20260824.md
- .claude/PRODUCT-BRIEF.md（§二/§六）
- docs/synova/audit-reports/2026-08-23-D504-D505.md（D504 基线核验）
- AGENTS.md（铁律 0-2/4/47/48）

## 12. 必答题 1 补充——target 配置骨架（修改后终态，编码照抄）

```js
// build-synova.cjs（本任务改动的两段；files/extraResources/nsis 等其余段保持 main 现状不动）
  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },   // D517 新增: CI artifact + 解包验证
    ],
    category: 'public.app-category.business',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],   // main 现状保留，无改动
    icon: 'assets/icon.ico',
    artifactName: 'SynovaAgent-${version}-win32-x64.${ext}',
  },
```

> files 白名单已在 main（electron/{main,backend-spawn,preload}.cjs + config.json + icon.png）；extraResources 三映射已在 main（dist→dist!renderer、dist/renderer→renderer、extensions→extensions）。**本任务对 files/extraResources 零改动**——写集表只含 §5.1 四条目。

## 13. 自检清单（dev-doc 侧，K3 可核）

- [x] 派单 4 必答题逐条覆盖（①配置骨架=§12 ②产物物理验证=DS1 ③CI=写集 desktop-build.yml+DS3 ④构建链契约=写集 build-synova.cjs 注释+DS4）
- [x] 现状全部实测（main ea89dee9: build-synova.cjs/electron/package.json/根 package.json scripts/vite.config.ts outDir/CI workflows 逐文件 read）
- [x] Done 标准 = 物理命令断言（test -d / du -sm / CI artifact），零 grep 冒充（D510 F1）
- [x] 写集 4 条目与 §12 声明一致；不碰 src/、electron/*.cjs（D518 领地）、scripts/audit/
- [x] gatekeeper exit 0（C1-C6）
- [x] 依赖声明: D504 已合 main（前置完成）；D518/D519 依赖本任务产物形态
