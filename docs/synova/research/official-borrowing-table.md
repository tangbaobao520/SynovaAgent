# D870 借鉴总表（可执行）｜四切片聚合

> 产出物：`docs/synova/research/official-borrowing-table.md`（本件第一份；第二份为 `official-change-cards.md`）
> 本件为**机械聚合**：条目文本逐字段复制自四份对照表各自的机器可读块，**未替任何作者改写内容或分类**。
> 本件不改码、不引入依赖；不含任何"通过"类评语。

---

## 〇、参照系（唯一，钉死）

```
/Users/wane/src/deepseek-harness/  @  tag dsh-v0.1.6-alpha.2  @  commit ddefc45fbc7f8e46dd73185e68295696d1297887
```

版本错配警示（四断面不一致，详见各切片表头）：**checkout 0.1.6-alpha.2 ｜ 打包运行时 0.1.6-alpha.1 ｜ .app 壳 0.15.7 ｜ updates 已下载 0.15.8 未安装**。
本总表所有 `official` 列均为四切片各自给出的官方锚点；其中属打包运行时断面或已标注"官方无实现/参照系外"者，各自保留原标注，本件不做归一。

---

## 一、聚合口径与复现命令

### 1.1 取块规则（**取每份文件的最后一个 ```json 块**）

⚠️ **配方必须写死四份切片文件名，不能用 glob**：合成件产出后，`docs/synova/research/official-*.md` 会**多匹配到本表与改法卡清单本身**（两者无 `d870_borrow_items` → `KeyError`）。实测：

```
$ ls docs/synova/research/official-*.md
docs/synova/research/official-borrowing-recheck.md
docs/synova/research/official-borrowing-table.md      ← 本件（合成件，须排除）
docs/synova/research/official-change-cards.md         ← 本件（合成件，须排除）
docs/synova/research/official-electron-kernel-runtime.md
docs/synova/research/official-model-switching.md
docs/synova/research/official-ui-patterns.md
```

**正确配方（写死四份，实测输出 39 / 35 / 23 / 12）**：

```bash
cd /Users/wane/SynovaAgent/.synova-wt-d870
python3 - <<'PY'
import re,json
FILES=['official-electron-kernel-runtime.md','official-ui-patterns.md',
       'official-model-switching.md','official-borrowing-recheck.md']
for f in FILES:
    s=open('docs/synova/research/'+f,encoding='utf-8').read()
    items=json.loads(re.findall(r'```json\n(.*?)\n```', s, re.S)[-1])['d870_borrow_items']
    print(f, len(items))
PY
```

实测输出：

```
official-electron-kernel-runtime.md 39
official-ui-patterns.md 35
official-model-switching.md 23
official-borrowing-recheck.md 12
```

### 1.2 ⚠️ 已知陷阱（实测，非推测）：不能用宽松正则取块

A/B 两份文件各含 **2 处** ```json 字样：第 2 处是**文末"复现命令"小节里被引用的配方字符串**（`official-electron-kernel-runtime.md:975`、`official-ui-patterns.md:1054`），不是 JSON 数据块。若用宽松正则 ```` ```json(.*?)``` ```` 取**最后一块**，会把该配方字符串当数据块 → **JSONDecodeError**。

> **行号时效（本件自身发生的一次实证）**：`official-ui-patterns.md` 的该行号**原为 `:1046`**，因 B 件修复一处数字（1087 → **1095** 行）后**漂移到 `:1054`**——这与 D 切片查出的"任务书锚点 9 处 MISMATCH（漂移 ±1～+6）"是**同一类现象**（引用行号随被引文件改动而漂移）。**结论不受影响**：在改后的 B 件上重跑，宽松正则仍 `JSONDecodeError`、严格正则仍得 1 块 / items = 35。`official-electron-kernel-runtime.md:975` 本次未变（A 件零改动），仍有效。

**四切片文件指纹（记录聚合时点，供后续核对是否已变动）**

> **行数口径 = `wc -l`（权威，写死）**。本件初稿该段混用了 `count('\n')+1`：C 因此多算 1（记 628 → 实为 **627**）；D 亦多算 1（当时 472 → 记 473），且 D 件本轮**自身两次修订**后为 **490**——两种成因叠加。故此处一律 `wc -l`，并注明时点。

```
$ wc -l docs/synova/research/official-{electron-kernel-runtime,ui-patterns,model-switching,borrowing-recheck}.md
    1008 docs/synova/research/official-electron-kernel-runtime.md
    1095 docs/synova/research/official-ui-patterns.md
     627 docs/synova/research/official-model-switching.md
     490 docs/synova/research/official-borrowing-recheck.md

$ shasum -a 256 docs/synova/research/official-{electron-kernel-runtime,ui-patterns,model-switching,borrowing-recheck}.md
a26b047567b7dc644334ec90feedae6a7a111d041bc4c725d16efd3bf905f9b8  docs/synova/research/official-electron-kernel-runtime.md
fae478a8a68171581fd2740298a12cd1392a0281932f4886b97737f149dffc81  docs/synova/research/official-ui-patterns.md
53cabf6959c3c9753183af6e14bb14d0207ed235467d881228f34f9312de66ed  docs/synova/research/official-model-switching.md
92ddcff5d4dd12f47b9584048ce9c3ab23a3655f92c7984de30fca786a8f17d7  docs/synova/research/official-borrowing-recheck.md
```

> A/B 两枚为**修复后终值**（A 未变；B 旧 `b56384b2…dd11745` 已失效）。B 件数字复验：35 条 / 可直接复制 25 / 可参照 10 / 官方无实现 0，与本表记载**逐字一致**，故**无需重新聚合**。**D 枚为真终值**（本轮两修后 `92ddcff5…`；旧 `2ce8fca6…` 已失效）；C 件未修订，`53cabf69…` 即其终值。

> **同类例（第三、四例）**：D 件 §4.2 #7 两修——①「597 键」系抽取脚本中间产物 → 换可复现数字 + 3 条命令（291 / 302 / 0）；② 结论射程过宽（"官方无对应包"）→ 收窄为「官方 **workspace**（`packages/**/package.json`）无此名，但 `docs/dependency-catalog.json:3196` 确有该名登记（外部依赖，`direct: true`）」。与前述「行号漂移」「`glob` 多匹配到合成件」同属**口径 / 中间产物 / 结论射程未写死**，均已换为可复现表述。

实测原始输出：

```
docs/synova/research/official-borrowing-recheck.md        宽松正则块数=1  严格正则块数=1
docs/synova/research/official-electron-kernel-runtime.md 宽松正则块数=2  严格正则块数=1
  宽松取最后一块: parse FAIL → JSONDecodeError: Expecting value: line 1 column 1 (char 0)
docs/synova/research/official-model-switching.md          宽松正则块数=1  严格正则块数=1
docs/synova/research/official-ui-patterns.md              宽松正则块数=2  严格正则块数=1
  宽松取最后一块: parse FAIL → JSONDecodeError: Expecting value: line 1 column 1 (char 0)
```

**结论**：必须用**严格正则**（开围栏后紧跟换行：```` ```json\n(.*?)\n``` ````）。§1.1 配方即为严格正则形式，实测四份各解析出 **1** 个数据块。

### 1.3 数字口径

本件计数一律为**聚合结果**（条数），不涉及官方树内的行数统计；凡引用官方行数处均沿用各切片原口径（canonical = `git grep`，tracked only）。

---

## 二、总条数与两个计数（三分类 + 官方无实现单列）

判据（照 CTO 口径）：按条目的 `official` 字段**是否声明"官方无实现"**切分。

| 计数 | 条数 | 说明 |
|---|---|---|
| **总条数** | **109** | 四切片机器可读块条目之和 |
| 三分类（合计 104〔口径 A〕；更宽判据下为 103〔口径 B〕——两口径见 §2.0） | 可直接复制 **66** ｜ 可参照 **36** ｜ 核心自研 **2** | `official` 有真实官方锚点 |
| **官方无实现**（单列，不混入三分类） | **5** | `official` 声明"官方无实现"；其 `class` 字段原写"核心自研"（**按裁决不改原分类**，仅在此单列） |
| 校验 | 104 + 5 = **109** | 与总条数一致 ✅ |

**与 CTO 概数对账**：CTO 给"109 条；三分类初计 可直接复制 66 / 可参照 36 / 核心自研 7；官方无实现 5 条"。本件现场重跑结果：**总 109 一致**；`class` **字段**分布 = 可直接复制 66 / 可参照 36 / 核心自研 7（**一致**）；但按 §二判据切分后，三分类应为 **66 / 36 / 2 = 104**，另 **5 条**归"官方无实现"。**两者之和 104+5=109**。差异仅来自"核心自研 7 条里有 5 条其 `official` 已明标官方无实现"，非数字出入。

### 2.0 ⚠️ 双口径声明（**两个数字都成立，计数时须先声明用哪条**）

`C-23` 的 `official` 写的是"**借鉴边界（按 G1 守卫与 CTO 口径），非官方对应物**"——它**既非**官方无实现、**也不指向**任何官方锚点。因此"三分类条数"取决于判据宽窄，**两种口径都成立**：

| 口径 | 判据 | 三分类条数 | 可参照/可直接复制/核心自研 | +官方无实现 5 | =总数 |
| --- | --- | --- | --- | --- | --- |
| **口径 A（本件 §二 采用）** | 切分依据 = `official` **字面是否含「官方无实现」** | **104** | 66 / 36 / **2** | 104+5 | **109** ✅ |
| **口径 B（更宽）** | 切分依据 = `official` **是否指向官方对应物**（含"非官方对应物"一并剔除） | **103** | 66 / 36 / **1**（仅剩 C-23 之外的 1 条核心自研） | 103+5+1（C-23 单列"无官方对应物"） | **109** ✅ |

**说明**：两口径的差值**恒为 `C-23` 这 1 条**。`C-23` 是**边界声明项**（声明"哪些可参照、哪些必须自研"），本身不消费任何官方实现。
**本件的主计数采用口径 A（104）**，因为 CTO 口径原文为"按 `official` 字段是否声明'官方无实现'切分"；但**两数并记于此**，以免 K3 复算时各按一套对不上。
**下游引用建议**：引用时写明「三分类 104（口径 A：按"官方无实现"字面切分；若按"是否指向官方对应物"更宽判据则为 103）」。

### 2.1 官方无实现清单（5 条，单列）

> ⚠️ **机械计数提示**：本节是**索引**，这 5 条的**全字段明细在同一文件 §五**。下游若以"表格行数"机械计数，**只计 §四 + §五**（66+36+2+5 = 109）；把本节一并计入会重复 5 条（得 114）。

| ID | 标题 | 原 `class` 字段 | 官方判定（`official` 原文摘要） | 来源切片 |
|---|---|---|---|---|
| `A-16` | 省电挂起（suspend 落盘 / powerSaveBlocker） | 核心自研 | 官方无实现（见下 §五 逐条原文） | A |
| `A-38` | 托盘（Tray）官方无实现 → 我方自研 | 核心自研 | 官方无实现（见下 §五 逐条原文） | A |
| `C-20` | 限流或失败后自动切换备用模型/provider | 核心自研 | 官方无实现（见下 §五 逐条原文） | C |
| `C-21` | 切换即中断在飞请求并立即重发 | 核心自研 | 官方无实现（见下 §五 逐条原文） | C |
| `C-22` | 每模型工具能力声明与工具集适配 | 核心自研 | 官方无实现（见下 §五 逐条原文） | C |

---

## 三、每切片贡献与配额对账

| 切片 | 文件 | 实际贡献 | 配额 | 是否满足 | 其中官方无实现 | `class` 字段分布 |
|---|---|---|---|---|---|---|
| A | `docs/synova/research/official-electron-kernel-runtime.md` | **39** | ≥12 | 满足 | 2 | 可直接复制 24 / 可参照 13 / 核心自研 2 |
| B | `docs/synova/research/official-ui-patterns.md` | **35** | ≥12 | 满足 | 0 | 可直接复制 25 / 可参照 10 |
| C | `docs/synova/research/official-model-switching.md` | **23** | ≥10 | 满足 | 3 | 可直接复制 11 / 可参照 8 / 核心自研 4 |
| D | `docs/synova/research/official-borrowing-recheck.md` | **12** | ≥8 | 满足 | 0 | 可直接复制 6 / 可参照 5 / 核心自研 1 |
| **合计** | — | **109** | ≥42 | 满足 | 5 | 可直接复制 66 / 可参照 36 / 核心自研 7 |

**缺口如实标注**：无。四切片**全部满足**各自配额（A 39≥12、B 35≥12、C 23≥10、D 12≥8）。总条数 109 ≥ 40（任务卡要求）≥ 42（四切片配额之和）。**无一处凑数。**

---

## 四、三分类清单（合计 104 条〔口径 A〕；更宽判据见 §2.0 口径 B = 103 条）

### 4.1 可直接复制（66 条）

| ID | 标题 | 分类 | 官方 file:line | 可执行动作 | 我们改到什么程度 | 来源 |
|---|---|---|---|---|---|---|
| `A-01` | 单实例锁先于 profile 生命周期 | 可直接复制 | apps/desktop/src/single-instance.ts:20 | 在 Synova 桌面端 main.ts 顶层、一切初始化之前抢 requestSingleInstanceLock；抢不到即 quit，第二实例只唤起既有窗口 | 双击第二次启动后主进程数=1、SQLite 写入者=1；第二实例 500ms 内以 exit 0 退出且第一实例窗口获焦 | A |
| `A-02` | 单入口 whenReady + 致命失败落盘 | 可直接复制 | apps/desktop/src/main.ts:776 | app.whenReady().then(main) 作为唯一入口；启动失败先把栈写入约定诊断文件（写盘失败不掩盖原始错误）再上报 | 人为启动抛错→诊断文件含栈；诊断目录不可写→仍以非 0 退出码退出并打印原始错误 | A |
| `A-05` | 窗口安全三件套硬基线 | 可直接复制 | apps/desktop/src/main.ts:136 | BrowserWindow webPreferences 固定 nodeIntegration:false + contextIsolation:true + sandbox:true，能力只经 preload 白名单 | 渲染进程 typeof require/process 均为 undefined；三开关任一被改则测试报红 | A |
| `A-06` | IPC 频道常量化单一声明点 | 可直接复制 | apps/desktop/src/ipc.ts:6 | 全部 IPC 频道名收敛到单一 ipc.ts 常量表，主进程与 preload 同源引用，禁止字面量散落 | 频道字面量命中全部位于常量表文件；新增频道必须同时改常量表与类型定义 | A |
| `A-07` | 产品 API 面最小化 + protocolVersion | 可直接复制 | apps/desktop/src/ipc.ts:54 | 渲染层只拿版本化只读状态与动作入口；版本号/包 URL/安装授权一律不接受渲染层输入 | 渲染层传 version/url 被忽略（非校验后接受）并落拒绝日志；调用不存在的方法抛 not a function | A |
| `A-08` | 来源协议+主机白名单校验 | 可直接复制 | apps/desktop/src/ipc.ts:71 | 每个 IPC handler 入口先校验 senderFrame 存在 + 协议为应用私有协议 + hostname 命中白名单，失败抛错 | 从 iframe/第三方页发起同频道调用 100% 抛错；assertDesktopSender 调用点数等于 handler 数 | A |
| `A-09` | 拥有窗口 + 主帧二次校验 | 可直接复制 | apps/desktop/src/main.ts:228 | 主窗口级 IPC 叠加『属于哪个 webContents』与『是否 mainFrame』两层校验 | 从子帧发起主窗口级调用抛 rejected IPC from a non-primary frame；窗口销毁后延迟调用抛错不崩溃 | A |
| `A-10` | 导航与新窗口全封闭 | 可直接复制 | apps/desktop/src/main.ts:142 | setWindowOpenHandler 一律 deny（http/https 交系统浏览器）；will-navigate 仅放行本应用协议与同 origin | 窗口内跳外站→窗口 URL 不变且系统浏览器被唤起；window.open 返回 null 且无新窗口 | A |
| `A-12` | preload 按 origin 分级 + stub 降级 | 可直接复制 | apps/desktop/src/preload-app.ts:22 | 只有产品 origin 挂完整 API；其他 origin 暴露同形态但零能力（仅 protocolVersion）的 stub | 非产品 origin 下 protocolVersion=1 且 updates=undefined；产品 origin 下两者齐备 | A |
| `A-13` | 唤醒/回前台即补检 + 退出反注册 | 可直接复制 | apps/desktop/src/main.ts:571 | powerMonitor resume 与窗口 focus 触发补检；will-quit 中 dispose 定时器并 off 监听 | 挂起 2h 唤醒后 30s 内出现一次补检（日志含 resume/focus 原因）；退出后 powerMonitor 监听数归零 | A |
| `A-14` | 完成式截止+指数退避+抖动+单调时钟 | 可直接复制 | apps/desktop/src/update-schedule.ts:102 | 长驻轮询改为完成式排程（计数归零才排下一次）+ 失败 2 倍退避封顶 + ±jitter + performance.now 单调时钟，参数经范围校验 | 注入恒失败上游→间隔按 2 倍增长不超上限且相邻间隔不等；注入固定 now/random→序列可复现（可写成测试）；dispose 后触发抛 polling is disposed | A |
| `A-18` | 渲染三线统一归口 reportFatal | 可直接复制 | apps/desktop/src/main.ts:665 | did-fail-load（排除 ERR_ABORTED -3）/ preload-error / render-process-gone（排除 clean-exit）统一进同一恢复入口，且退出中与已销毁窗口不报 | kill 渲染进程→弹恢复框且分类为渲染退出；正常导航→不弹框；退出中 kill→不弹框 | A |
| `A-19` | AggregateError 递归展开 | 可直接复制 | apps/desktop/src/startup-error.ts:11 | 聚合失败用 AggregateError，展示层递归展开子错误 message，禁止只显示最外层 | 构造启动失败+清理失败→详情同时含两条原因字符串，缺任一即测试失败 | A |
| `A-20` | stderr 有界环形缓冲 64KB | 可直接复制 | apps/desktop/src/host-process.ts:25 | 长驻子进程 stderr 用 slice(-64K) 保留尾部，永不无界累积；仅在异常退出时拼入错误 | 灌 10MB stderr→父进程驻留增量<1MB，且保留的是最后一段日志（首段被丢弃） | A |
| `A-21` | 等待用定时器 unref | 可直接复制 | apps/desktop/src/host-process.ts:49 | 所有带超时的等待中，定时器建立后立即 unref 并在 finally clearTimeout | 退出路径上存在 10s 超时等待时，进程不因此延迟退出（退出耗时<1s） | A |
| `A-24` | 未签名构建限制在 Windows 且硬失败 | 可直接复制 | apps/desktop/scripts/electron-builder-config.mjs:52 | 把已签名/未签名做成显式开关；不支持未签名的平台直接抛错停构建，禁止静默产出裸包 | UNSIGNED=1 打 macOS→构建非 0 退出并打印该错误；不带开关打 macOS→产物通过 codesign --verify | A |
| `A-26` | 签名后独立验签（fail-closed） | 可直接复制 | apps/desktop/scripts/electron-builder-config.mjs:166 | 签名后加独立验签步骤，并同时校验包内更新配置一致性；任一失败即中断构建 | 人为破坏签名或改坏 app-update.yml→构建失败并指出是哪一项校验失败 | A |
| `A-27` | win forceCodeSigning + sha256 | 可直接复制 | apps/desktop/scripts/electron-builder-config.mjs:178 | Windows 包强制签名 + sha256 摘要，且签名发布者名与更新包发布者同源取值 | Get-AuthenticodeSignature 为 Valid 且 Subject 与更新配置发布者一致 | A |
| `A-29` | 下载/安装分离，双授权 | 可直接复制 | apps/desktop/src/update-coordinator.ts:65 | autoDownload=false + autoInstallOnAppQuit=false；下载与安装是两个独立 API，各需一次用户确认 | 仅检查自动；不点下载则无更新流量（抓包 0 字节）；点下载后关闭应用→版本号不变 | A |
| `A-30` | allowDowngrade=false | 可直接复制 | apps/desktop/src/update-coordinator.ts:70 | 显式关闭降级，并用 gt(version,current) 自行判定是否更新，不依赖上游语义 | feed 指向更低版本→状态停在 idle，不出现可下载项（可写成单测） | A |
| `A-31` | 安装授权版本绑定（拒绝 TOCTOU） | 可直接复制 | apps/desktop/src/update-coordinator.ts:127 | 主进程持有候选项，渲染层只回显确认；install/download 均校验 version===candidate，错位即拒 | 下载 0.15.8 后把确认版本改成 0.15.9→抛 confirmed target is not ready 且不安装 | A |
| `A-33` | 空闲超时 + 参数校验 + 主动 abort | 可直接复制 | apps/desktop/src/update-http-executor.ts:13 | 对外 HTTP 用空闲（静默）超时而非总时长超时；超时值范围校验；超时后解绑全部监听并 abort 请求 | 慢速但持续有字节的大文件不被中断；建立后静默→在阈值内中断且错误码 ETIMEDOUT；传 0 或 1e12→启动即抛参数错误 | A |
| `A-34` | 网络 vs 操作失败分离分类 | 可直接复制 | apps/desktop/src/update-presentation.ts:5 | 按操作(check/download/install)×是否网络错误组合成语义枚举，映射到不同恢复建议；渲染层只拿语义不拿原始诊断 | 断网触发检查失败→走 *-network 分支且文案不含原始堆栈；非网络错误→走非 network 分支，两条路径可分别断言 | A |
| `A-37` | 子窗口 IPC 三重归属校验 | 可直接复制 | apps/desktop/src/update-dialog.ts:107 | 子窗口 IPC 校验 sender + 必须 mainFrame + URL 全等于专属页面；响应值只接受已展示过的选项索引或 cancelId | 从主窗口调子窗口频道→抛错；子窗口传未展示索引(如 99)→抛 invalid dialog response | A |
| `B-01` | 密度做成持久化用户设置 | 可直接复制 | packages/client/ui-chat/src/chat-settings.ts:12 | 对话密度做成用户可见设置（normal\|compact），枚举封闭写入用户设置文档，默认 compact，schema 同时作为持久化结构与跨进程校验信封 | 设置里存在完整/紧凑两档；切换后刷新仍生效；传非法值被 schema 拒绝并回落默认；两档下同一对话可见高度差≥30% | B |
| `B-02` | 卡片密度硬数值基线 | 可直接复制 | packages/client/ui-deliverables/src/client/Deliverables.module.css:10 | 产出卡/列表行按官方可量测基线落地：行高60px、内边距8px10px、元素间距10px、圆角18px、边框0.5px、主标签13px/500/20px、副标签10px/400/16px、主副间距2px、hover过渡120ms、图标容器40x40圆角10px、操作组高28px | 产出卡实测行高60px(±1)、主标签13px、副标签10px、主副间距2px；同名元素在列表与详情两处取同一token，取值一致 | B |
| `B-03` | 容器查询断点 + 粗指针触达 | 可直接复制 | packages/client/ui-deliverables/src/client/Deliverables.module.css:34 | 卡片网格用 @container 而非视口断点（620px 回落单列）；@media(pointer:coarse) 下操作区提到 44px 最小触达 | 同一卡片放进400px侧栏自动单列不变形；触屏按钮可点区域≥44x44px；窗口1200→600px不出现横向滚动条 | B |
| `B-04` | 五态状态点 + 关闭联合穷尽 | 可直接复制 | packages/client/ui-primitives/src/StateDot.tsx:8 | 业务状态收敛为 done/warning/ongoing/error/idle 五态；状态映射用穷尽检查，未登记值走 assertNever 抛错而非静默显示成正常态；同义状态归并（stopping与killed共用警示）需在注释里写明理由 | 状态点颜色只有5种；注入未登记状态字符串→抛 unhandled job status 且不渲染任何状态点（不出现绿色看起来正常的假象）；每个业务状态在单测中可断言到唯一呈现态 | B |
| `B-05` | 时长最多两级相邻单位 | 可直接复制 | packages/client/ui-jobs/src/client/JobListAction.tsx:62 | 运行时长统一 h+m / m+s / s 三形态；不为无人使用的量级扩词汇表（官方明确不做 day/month 分支） | 时长显示只有 Xh Ym/Xm Ys/Xs 三种；不存在天/月分支（grep零命中）；跨单位边界59s→60s、59m59s→1h0m显示不跳变 | B |
| `B-06` | 状态→颜色 / 状态→文案 两函数分离 | 可直接复制 | packages/client/ui-jobs/src/client/JobListAction.tsx:44 | dotState(status) 与 statusLabel(status,t) 拆成两个独立纯函数，各自穷尽检查；文案进 locale 表，不散落在 JSX | 状态字符串不命中任何 .tsx 内裸中文/裸英文状态词（全来自 locale 键）；新增语言只改 locale 文件不改组件 | B |
| `B-07` | 刻度条空态是 null 不是 0 | 可直接复制 | packages/client/ui-chat/src/client/chat/StatsPills.tsx:332 | 无数据时整条刻度不渲染（return null）；分项独立判定——有计数无用量时只显示计数胶囊，不显示0值胶囊 | 新会话下刻度条DOM不存在；构造有轮次但全失败无token的会话→只出现计数胶囊；不出现任何 0 tok 类无意义数字 | B |
| `B-08` | 刻度数字走 durable projection，回落整体替换 | 可直接复制 | packages/client/ui-chat/src/client/chat/StatsPills.tsx:327 | 统计数字取自持久投影（翻页/压缩不变），不从当前渲染消息数组现算；确需回落时整体替换且字段名刻意对齐，使两种来源可整体互换 | 向上加载更多历史后刻度数字不变（断言翻页前后相等）；无投影环境下数字来自窗口折叠且不含undefined/NaN；两种来源字段名集合完全相同 | B |
| `B-10` | 流式增量不重渲刻度条 | 可直接复制 | packages/client/ui-chat/src/client/chat/StatsPills.tsx:317 | 刻度条用 memo 包裹并订阅已落定节点身份，使流式 token 增量不触发该行重渲；挂载在 composer dock 上随滚动区停靠 | 流式输出期间统计条渲染计数=0（落定后+1）；长输出(>5000 token)下无长任务、滚动不掉帧 | B |
| `B-11` | 折叠摘要分区取行 | 可直接复制 | packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:32 | 思考行折叠摘要：流式中显示最后一行（用户在关心现在在想什么），结束后显示第一行（首句即结论）；两条路径都去掉 Markdown 粗体标记；running\|ok 落到 data-state 供 CSS 分支 | 流式中折叠行随最新内容滚动更新；结束后固定为首行且刷新不变（断言文本相等）；折叠态文本不含 ** | B |
| `B-12` | 折叠态固定高度 + contain，防布局跳动 | 可直接复制 | packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:7 | 折叠态锁死24px（随字号设置线性补偿）；加 contain:size layout 抑制回流外溢；展开后把折叠开关置为 sticky top:0 保证收起入口可达 | 折叠态高度恒为24px；连续20条思考行折叠时累计CLS=0（PerformanceObserver断言）；展开长内容滚动时收起开关始终在视口顶部可见 | B |
| `B-14` | 状态不靠动效单通道 | 可直接复制 | packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:41 | 靠颜色/动效表达的状态必须同时渲染 visually-hidden 的状态词，使辅助技术不依赖动效也能获知状态 | 关闭CSS或仅读DOM文本时仍能得到状态词；进行中/成功/失败/空闲各有独立可读文本且不重复 | B |
| `B-15` | 卡片结构固定，用层级替代按钮嵌套 | 可直接复制 | packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:21 | 产出卡固定为 图标+名称+状态副文案+单一主操作+溢出菜单；全卡点击用覆盖式透明button(z-index:1)，操作组抬到z-index:2并用pointer-events分层，明确不在可点卡片内嵌按钮 | 卡片空白处点击=主操作；操作按钮点击只触发自身不冒泡（断言调用计数）；DOM中不存在button内含button | B |
| `B-16` | 副文案承载四阶段 + 错误独立视觉 | 可直接复制 | packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:46 | 同一行副文案承载 描述→操作中→完成→失败 四态；失败态打 data-error 换错误色token；非正常态挂 role=status 供读屏播报 | 四阶段文本各不相同（断言集合）；失败态颜色为错误色token非次要色；四态变化均可被 role=status 捕获 | B |
| `B-18` | 菜单关闭后焦点还给触发按钮 | 可直接复制 | packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:39 | 菜单选择/关闭后把焦点还给触发元素再执行动作；菜单因条件失效（disabled）时主动收起，不留点不开的菜单 | 键盘完成菜单操作后 document.activeElement=原触发按钮；菜单禁用时自动收起不残留 | B |
| `B-22` | 空态分从来没有与筛选为空两型 | 可直接复制 | packages/client/ui-workspace/src/client/locales.ts:23 | 空态至少分两型：从未有数据 vs 筛选后为空；分型条件写在数据侧（rows.length>0 && visible.length===0 才算搜索空态）；两型文案与下一步动作不同 | 全新账号无会话与搜索无命中显示不同文案（断言文本不等）；搜索无结果旁有清除筛选入口、从未有旁有创建入口；两态都不显示数字0 | B |
| `B-23` | 空态＝语境内联一句，精确到成因 | 可直接复制 | packages/client/ui-model-selection/src/client/locales.ts:32 | 面板空态是内联单句（说明当前上下文为何为空），不用全屏插画也不用暂无数据式裸标签；不同成因给不同句子（模型为空 vs 该模型无推理等级） | 每个面板空态≤1句且以句号结束；同屏不出现两段以上空态文案；模型为空与该模型无等级在不同条件下显示不同句子（可断言） | B |
| `B-24` | 降级文案三段式 | 可直接复制 | packages/client/ui-conversation/src/client/locales.ts:18 | 降级文案模板固定为 原因 + 受限动作 + 仍可用动作 三段式（官方范例：父会话已离线，无法继续发送；仍可停止当前运行） | 所有降级文案含仍可…子句（正则断言）；不出现只写不可用/失败三字而不给下一步的文案；降级态下仍可做的动作实际可点通（端到端断言） | B |
| `B-26` | 过渡时长分级表 + 统一结构曲线 | 可直接复制 | packages/client/ui-chat/src/client/chat/TurnNavigator.module.css:40 | 建一张过渡时长表：80ms微反馈(图标动作)/120ms元素状态(transform、背景)/140ms控件尺寸/160ms面板边框/220ms结构性移动；结构性位移动画统一 cubic-bezier(0.2,0.8,0.2,1)；新组件查表取值 | transition 取值全部落在表内（脚本断言，非表内值报红）；结构性位移统一该曲线；不存在 transition:all（可断言） | B |
| `B-27` | prefers-reduced-motion 下过渡置 none | 可直接复制 | packages/client/ui-attachment/src/FileCard.module.css:117 | 在 prefers-reduced-motion: reduce 下把过渡直接置 none（而非变慢或减半，后者仍引发不适）；功能不受影响 | 开启系统减少动效后 getComputedStyle(el).transitionDuration 为 0s（可断言）；该动作仍可完成；无时长>0的过渡残留（脚本扫描） | B |
| `B-29` | 主题双段引导防首帧白闪 | 可直接复制 | packages/client/ui-theme/src/boot-theme.ts:16 | head CSS 在任何脚本前先给画布上色（引导期用硬编码色常量不能用令牌，因令牌本身待主题类决定）；system 偏好走 @media(prefers-color-scheme:dark) 纯CSS判定；body 脚本再装 palette 选择器（data-ds-dark-theme）与字号；两条注入有序（style在前、body script在后） | 暗色偏好冷启动无白闪（首帧背景即#151517，录屏逐帧断言）；禁用JS后仍是正确底色；切换偏好不出现中间态旧色 | B |
| `B-30` | 暗色覆盖挂 body 属性；令牌只向下继承 | 可直接复制 | packages/client/ui-theme/src/styles/design-platform.css:80 | 配色令牌声明在 body，暗色用 body[data-ds-dark-theme] 属性覆盖整套变量（而不是类名）；任何消费令牌的规则也必须挂在 body 或其子元素 | 令牌消费规则无一挂在 html（脚本断言）；切换 data-ds-dark-theme 后所有表层（含滚动条、菜单、弹层）同步变色，无残留亮色 | B |
| `B-31` | 可读性设置范围硬约束 | 可直接复制 | packages/client/ui-theme/src/theme-settings.ts:24 | 字号上下界与默认值写成导出常量（UI/测试/文档共同引用，避免三处写死）；schema 在跨界处强制 step(1)+min+max+default；另提供类型收窄函数 | 滑杆范围=12–17且只能整数；手工写入11/18/13.5/"big" 全部被拒并回落默认14（四条断言）；字号变化时正文与折叠行高度同步（对齐B-12的delta变量） | B |
| `B-32` | 虚拟行高具名常量 + 纯投影 | 可直接复制 | packages/client/ui-trajectory/src/client/trajectory-virtual-rows.ts:6 | 长列表虚拟化拆成纯函数投影（记录→可测量行，含逻辑索引），行高用具名常量（30/20/9）而非常量表达式，使总高可精确预计算、滚动位置可恢复 | 虚拟化投影是纯函数（同输入同输出，无Date/随机）；总高=Σ行高（断言相等）；滚动到50%后刷新恢复误差≤1行 | B |
| `B-34` | 透明热区可读名 / 禁用有语义 / 展开报 aria-expanded | 可直接复制 | packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:52 | 覆盖式透明热区必须带 aria-label 与 title（透明≠不可读）；禁用态除变灰外给 cursor:not-allowed 语义；展开/收起控件报告 aria-haspopup/aria-expanded；图标按钮一律有可读名称 | 自动化无障碍扫描在关键面板0个serious级问题；所有图标按钮有可读名称；所有展开控件有aria-expanded且随状态翻转（断言属性） | B |
| `C-02` | 选择代次守卫(latest-wins，迟到响应不回写) | 可直接复制 | packages/client/ui-model-selection/src/client/directory.ts:45-46,91-113,119-127 | 每次切换递增代次；响应回来先比代次，不匹配即丢弃；Host 重连时代次失效并复位在飞状态 | 连发两次切换+旧响应迟到 → status/error/current 均不被旧响应改写 | C |
| `C-06` | 切换失败零副作用(校验先于落事件) | 可直接复制 | packages/api/session-controller/src/commands.ts:137-151,160-167 | 顺序固定为校验→归一化→落事件/缓存；校验失败直接抛且不落任何事件 | 失败后事件流无新增选择事件、next 不变、默认值未写；错误带 provider/model 详情 | C |
| `C-07` | 存储失败不阻断本次切换(仅告警) | 可直接复制 | packages/api/session-controller/src/commands.ts:152-158 | 把本会话已切换与默认值已保存拆成两件事；后者失败只 warn 且返回成功 | 存储失败时切换仍生效、返回成功、且必有 warn 日志 | C |
| `C-08` | adapter 默认值不回放为会话选择 | 可直接复制 | packages/api/session-controller/src/agent.ts:303-308 与 packages/api/session-controller/tests/session-models.host.spec.ts:545-558 | 对适配器自填默认参数打标记；恢复会话选择时丢弃该类默认值 | 日志 effort 来自 adapter 默认 → 恢复出的选择不含该字段；显式选择必须保留 | C |
| `C-09` | 配置写入带 revision(CAS)且冲突显式返回 | 可直接复制 | packages/client/ui-settings-models/src/client/operations.ts:96-101 与 packages/core/agent-default-model/src/index.ts:100-106 | 配置写入携带读取时 revision；不匹配即拒；前端把冲突映射为独立结果类型 | 并发提交同一 revision → 后者得冲突(非静默覆盖)；冲突与普通拒绝在 UI 可区分 | C |
| `C-10` | 目录未列出不等于不可用(advisory vs authoritative) | 可直接复制 | packages/client/ui-model-selection/src/client/directory.ts:20-27 与 packages/api/session-controller/tests/session-models.host.spec.ts:598-627 | 可路由性由宿主权威判定；模型清单仅作展示建议；true/false/null 三态必须区分 | 清单未列但路由可服务的模型可切换成功；routable===null 时不锁输入 | C |
| `C-11` | provider 局部失败隔离 | 可直接复制 | packages/api/session-controller/src/types.ts:137-150 与 packages/api/session-controller/tests/session-models.host.spec.ts:350-386,389-428 | 目录拉取按 provider 独立成败；失败者进 failures，成功者照常用；非 Error 失败也归一化为可展示 message | 一个 provider 挂掉其余仍可用；failures 逐条可展示；字符串异常不漏 | C |
| `C-12` | 能力校验放在准入处+文案键本地化 | 可直接复制 | packages/api/session-controller/src/commands.ts:338-344 与 packages/client/ui-conversation/src/client/image-labels.ts:34 | 模态/能力校验放在提交内容时而非切换时；给机器可读 reason 码并映射到可操作文案 | text-only 提交图片 → 稳定 reason=MODEL_DOES_NOT_SUPPORT_IMAGES 且文案引导换模型 | C |
| `C-16` | 终态配额 vs 瞬时限流的分类 | 可直接复制 | packages/llm/llm/src/error.ts:14,88-99 | 建错误码分类(不解析 message 做路由)；额外识别配额/余额/预算耗尽文案为终态，不重试 | 配额耗尽文案→不重试；限流文案→可重试；分类集中于单一可单测函数 | C |
| `C-18` | 判别性夹具:消费完整性断言(少调用即报红) | 可直接复制 | packages/test-support/llm-replay/src/index.ts:167-181 | 测试收尾必须证明每个录制脚本被真实消费完；少发一次请求或从未绑定即抛错 | 故意删掉一次调用 → 测试报红；未删则绿(提供接线了≠被执行的判别力) | C |
| `C-19` | 可脚本化故障序列服务器 | 可直接复制 | packages/test-support/llm-mock-server/src/index.ts:16-71 | 用具名故障清单(限流/配额/上下文溢出/工具调用成功/流中断)+可复现随机权重替代手写 mock | 故障按次消费；rate_limit/quota_exceeded/context_overflow/tool_call_success 四行为可直接被本片用例引用 | C |
| `D-01` | 运行时不变量注册表 seam（register/install/违约抛 INVARIANT） | 可直接复制 | packages/runtime-diagnostics/invariants/lib/index.js:12,80,92 | 照抄三段 seam，断言体用我方事件名重写 | src/infra/** 出现可注册 invariant 表，删任一安装点即报红 | D |
| `D-02` | 持久化分级准则（跨重启要不要复活） | 可直接复制 | packages/jobs/jobs/README.zh.md:53 / packages/schedule/schedule/README.zh.md:12 | 写成存储选型 checklist 并对存量逐项标注 | Sentinel 工单/哨兵任务逐项标复活性，无空项 | D |
| `D-03` | 截断账本（trimTrailingPartialUtf8 + describeOmitted） | 可直接复制 | packages/util/output-retention/lib/index.js:109,261 | 20+ 处 .slice(0,N) 改经账本出口 | 每处截断有账单条目（切多少/切在哪/可否取回/精确字节） | D |
| `D-07` | 设置热改 live/restart 分类声明 | 可直接复制 | packages/settings/settings/lib/types/index.d.ts:21 | 每个配置命名空间声明生效方式 | 配置面 100% 有 live/restart 标注，未标注不合并 | D |
| `D-08` | 会话统计折叠规则（step/end 计步权威） | 可直接复制 | packages/session/session-stats/lib/types/projection.js:6-11 | 先补 turn/step 事件，再照抄折叠与边界状态 | 8 字段 + 边界状态逐项有测试；取消/失败步各计一条 | D |
| `D-09` | 跨会话引用上限/限流（3 条 / 64KB / 非正 limit 抛错） | 可直接复制 | packages/context/session-reference/lib/index.js:94,98,519-520 | 借常量与防御式抛错 | 引用注入有硬上限，越限报错不静默截断 | D |

### 4.2 可参照（36 条）

| ID | 标题 | 分类 | 官方 file:line | 可执行动作 | 我们改到什么程度 | 来源 |
|---|---|---|---|---|---|---|
| `A-03` | 退出状态机 preventDefault→清理→quit | 可参照 | apps/desktop/src/main.ts:699 | before-quit 中 preventDefault → 先 hide 窗口 → dispose 各组件 → 等待后端 close → finally 调 app.quit | 关窗≤1 帧消失；退出前 sentinel/cron 均 dispose（无残留 interval）；close 抛错仍在 10s 内退出并有 stderr | A |
| `A-04` | shuttingDown / quitting 双标志 | 可参照 | apps/desktop/src/main.ts:45 | 区分『正在关机不要弹框』与『已进入关机不要起新活』两个语义标志 | 退出中触发 fatal→不弹新框仅有 stderr；退出中定时到达→不启动新诊断（日志无新 run id） | A |
| `A-11` | 自定义协议 privileged + codeCache | 可参照 | apps/desktop/src/main.ts:70 | 在 app.whenReady 之前 registerSchemesAsPrivileged，并开启 stream 与 codeCache | 流式响应经私有协议增量到达（首字节<500ms）；注册被挪到 ready 之后会报错 | A |
| `A-15` | 停机前准入闸：锁→排空→再检查 | 可参照 | apps/desktop-host/src/update-tasks.ts:40 | 需要停机的操作前：先拒新请求(503)→await 排空已准入请求→复核锁未被顶替→再检查是否仍有 running/stopping 任务 | 诊断中途发起停机→新请求 503；已准入请求收尾后才返回可停机；期间有新任务准入则返回仍活跃并拒绝停机 | A |
| `A-17` | 首错去重 + 三档恢复 + 可重入 | 可参照 | apps/desktop/src/fatal-recovery.ts:40 | 致命错误只弹一次；按错误类裁剪选项（端口占用不给『禁用插件』）；恢复动作失败不放弃，改文案后循环重试 | 连抛 5 次致命错误只出现 1 个对话框；端口占用时不出现禁用插件按钮；stop 抛错后弹窗仍可用且第二次点击可成功退出 | A |
| `A-22` | 分级终止阶梯 + 干净退出判定 | 可参照 | apps/desktop/src/host-process.ts:201 | 优雅 shutdown(10s)→SIGTERM(5s)→SIGKILL(5s)；并把『已退出』与『干净退出』分成两个结论，不干净则拒绝下一步 | 忽略 SIGTERM 的子进程最终被 SIGKILL 且父进程记录各段耗时；退出码非 0 时判不干净且不继续下一阶段 | A |
| `A-23` | 弹窗集合 AbortController 统一撤销 | 可参照 | apps/desktop/src/main.ts:213 | 并发提示统一登记进集合，状态跃迁时遍历 abort 并清理集合 | 并发打开 3 个提示后进入阻塞态→3 个全关且集合长度归 0（无泄漏） | A |
| `A-25` | mac hardenedRuntime + notarize + signIgnore | 可参照 | apps/desktop/scripts/electron-builder-config.mjs:126 | 一次性定好预签名子树与封签责任（signIgnore 覆盖已预签名运行时与 pak），并开 hardenedRuntime + notarize | codesign --verify --deep --strict 通过 + spctl -a -t exec 通过 + 首次启动无 Gatekeeper 拦截 | A |
| `A-28` | 运行时树 sha256 完整性清单 | 可参照 | apps/desktop/src/runtime-tree.ts:77 | 随包运行时生成条目级 sha256+可执行位清单并写入根描述符，启动/升级时可校验 | 篡改运行时任一文件→校验报红并指名路径；清单缺失→降级且显式 degraded（不静默继续） | A |
| `A-32` | 更新前活动任务闸九步编排 | 可参照 | apps/desktop/src/main.ts:348 | 等落定→inspect 读态→用户确认→lock→复核活跃态未变→干净停后端→接管退出；异常→unlock 恢复准入；失败→自动重启后端并重新导航 | 诊断运行中发起升级→提示有活跃任务且需二次确认；锁期间新请求 503；停后端失败→版本不变、后端自动拉起、界面可用（无白屏死锁） | A |
| `A-35` | 离线内建壳 + 后端未就绪 503 占位 | 可参照 | apps/desktop/src/main.ts:406 | 壳资源由主进程从随包 dist 本地服务；权威数据走后端；后端未就绪返回 503 占位（含重试入口）而非白屏 | 拔网线启动→壳正常渲染且无网络请求；后端未起时出现 503 占位与重试按钮；请求 /../../etc/passwd→403 | A |
| `A-36` | 模态覆盖窗跟随父窗/即解绑/ready-to-show | 可参照 | apps/desktop/src/update-overlay.ts:13 | 模态用跟随父窗内容边界的覆盖层；closed 时同时解绑 move/resize 并移除注入 CSS；ready-to-show 才 show；Windows 回退原生模态 | 拖拽/缩放父窗覆盖层 1 帧内跟随无错位；连续开关 20 次父窗监听数不增长且 CSS 注入归零；无白闪 | A |
| `A-39` | 长驻事件日志 JSONL + 白名单字段落盘 | 可参照 | apps/desktop/src/update-journal.ts:20 | 长驻/更新过程写白名单字段的 JSONL（只 phase/targetVersion/整数进度/固定错误分类），每条 flush，禁止原始错误文本与凭证落盘 | 日志中不出现任何原始错误串/URL/凭证（正则扫描可判）；每条记录落盘后进程被杀仍可读；同一状态重复上报不写重复行 | A |
| `B-09` | 同层互斥面板用单一状态变量 | 可参照 | packages/client/ui-chat/src/client/chat/StatsPills.tsx:321 | 同一锚点下的互斥面板用一个 'a'\|'b'\|null 状态表达当前打开项，开一个自动关另一个（跨层并发场景才用集合，见A-23） | 依次点开两个胶囊→任意时刻DOM中恰有1个对话框；按Esc/点外部后状态回到null（可断言） | B |
| `B-13` | 运行中扫光（非进度）+ 动效不拦指针 | 可参照 | packages/client/ui-chat/src/client/chat/ReasoningRow.module.css:37 | 用循环扫光表达在动但进度未知（300px渐变条 2.6s 从-300px到100%，90%处即到位留静止期），与确定性进度条严格区分；动效层 pointer-events:none | 扫光周期2.6s±0.2s；进度未知任务不出现百分比数字（grep断言）；扫光层下方按钮点击100%命中 | B |
| `B-17` | hover 交换描述与动作提示 | 可参照 | packages/client/ui-deliverables/src/client/Deliverables.module.css:20 | 静态显示说明文本，hover 时同一行替换为动作提示（隐藏一个显示另一个），不叠加两段文字 | hover前后该行文本变化但行高不变（无跳动）；两态在标称宽度下均不截断为… | B |
| `B-19` | 权限三档盾形+语义标记，未知档不给图标 | 可参照 | packages/client/ui-permission-presets/src/client/PermissionSelect.tsx:29 | 权限等级用同一盾形底+语义标记（勾=只读/铅笔=可写/叹号=全权）；图标用 currentColor 继承所在行文字色，避免维护两套配色；宿主自定义档位返回 undefined 不猜图标 | 三档权限在触发器与菜单里图标一致且颜色随所在行文字色（无硬编码色）；第四档自定义权限显示为无图标；16x16下可辨识 | B |
| `B-20` | 目录快照与失效 tick 拆两 store | 可参照 | packages/client/ui-permission-presets/src/client/catalog.ts:17 | 可选清单的 最后一份完整值 与 失效通知 拆成两个 store，换目录前先发失效 tick 让显示旧选项的界面主动丢弃；构造时先订阅两类失效源再发起首次读取，关闭 install/read 竞态 | 清单增删档位瞬间界面不出现已删除档位（可写成时序断言）；断连重连后旧值不残留；首读期间到达的通知不丢（断言最终值=最新值） | B |
| `B-21` | 多入口共用进程级单例目录 | 可参照 | packages/client/ui-permission-presets/src/client/catalog.ts:1 | 同一份配置（模型/权限）在多处呈现时共用一个 latest-result-wins 进程级读取器，不各自请求，保证两处不显示互相矛盾的状态 | 同屏同时打开设置面板与弹出选择器→两处档位完全一致（断言相等）；变更后两处同时刷新（不一致窗口0帧）；一次变更多处消费只发1次读 | B |
| `B-25` | 空/错/正常共用一个 DOM 位 | 可参照 | packages/client/ui-deliverables/src/client/PresentedFileCard.tsx:58 | 状态行用同一 DOM 位承载正常/空/失败，通过 data-* 切换视觉与可读性（data-error 换色、role=status 开播报），不为空态失败态各造组件 | 三态使用同一组件（组件数不变）；三态切换行高不变；仅正常态无 role=status，其余有 | B |
| `B-28` | 滚动条皮肤：令牌挂载层一致 + 双路径互斥门 | 可参照 | packages/client/ui-theme/src/styles/scrollbar.css:16 | 自绘滚动条：规则必须挂在令牌声明所在层（body，因自定义属性只向下继承，挂 html 会解析为 invalid 而回落 auto）；WebKit 与标准两条路径必须互斥（声明非 auto 的 scrollbar-width/color 会让该元素所有 ::-webkit-scrollbar* 规则含 hover 被丢弃）；滚动条宽度做成可被布局消费的变量而非硬编码 | 深色主题下滚动条不是系统白色（截图断言）；悬停滚动条在 Chromium 与 Firefox 均可看到反馈；两浏览器颜色一致 | B |
| `B-33` | 滚动容器导出稳定 data-* 锚点 | 可参照 | packages/client/ui-chat/src/client/chat/StatsPills.tsx:5 | 滚动容器导出稳定的 data-* 标识，停靠/浮层元素据此定位，不依赖结构层级或类名猜测 | 滚动区有稳定 data-* 标识；停靠元素滚动中始终贴合（偏移≤1px）；不存在依赖 nth-child 的定位（grep断言） | B |
| `B-35` | 空态是可填充的具名槽位；无占用者时入口整体消失 | 可参照 | packages/client/ui-workspace/src/client/contract/slots.ts:1 | 把空态/首屏引导区做成可被扩展填充的具名槽位（declare module 做 SlotMap 声明合并，含 slot 名与 owner props 类型）；槽位触发器与槽内实现分属不同 owner；洞里可再声明子洞（kind:'single'）；槽位无人占用时该能力入口整体不渲染，不留死按钮 | 卸载填充槽位的扩展后入口完全消失（DOM不存在、无占位空按钮，可断言）；装上后入口出现且功能可用；槽位名与props类型在契约文件单点声明，全仓库对槽位名的引用只来自该声明（grep断言）；新增槽位占用者只加文件、不改框架代码 | B |
| `C-01` | 双入口共享单一 per-session 选择器状态 | 可参照 | packages/client/ui-model-selection/src/client/service.ts:69-85 与 packages/client/ui-model-selection/src/client/directory.ts:16-36 | 多个选择入口共用同一个按会话键控的状态实例，会话销毁即回收 | 同一会话两入口读到同一实例(===)；两会话互不影响；无实例泄漏 | C |
| `C-03` | 持久选择折叠 pending/lastUsed/next | 可参照 | packages/api/session-controller/src/model-selection-projection.ts:35-68 | 选=写 pending；真正发请求=写 lastUsed 并清 pending；next = pending ?? lastUsed；带 stateVersion | 请求后 pending 必为 null；重复写入幂等；重放事件流后 next 一致 | C |
| `C-04` | 装配快照边界(current/assembled 双字段) | 可参照 | packages/core/agent/src/model-selection.ts:26-31,77-107 | 切换不改在飞请求；装配时快照、请求时套用快照，下一次装配才吃新值 | 在飞 step 路由不变；下一步用快照值而非最新值；prompt 变量与请求路由不劈叉 | C |
| `C-05` | 模型变更公告(durable notice+精确文案) | 可参照 | packages/core/agent/src/model-selection.ts:41-56,108-121 与 packages/core/agent/README.md:141 | 路由变更时追加 plugin 来源 notice，标明上方轮次由 X 生成、此后用 Y；仅 effort 变更不追加 | 公告恰一条且文案/summary 可断言；effort-only 零公告；请求头未落盘失败则下次再公告 | C |
| `C-13` | token 计量的路由归因与去重聚合 | 可参照 | packages/llm/token-meter/src/turn-usage.ts:6-27,126-159,169-177 | 按 turn 聚合 attempt；四桶精确求和；仅当每个 attempt 都有 provider/model 归因才输出 routes；缺边界即返回 undefined | 跨两路由 turn → routes 含两条且去重；缺任一路由 → routes=undefined；四桶与 total 自洽 | C |
| `C-14` | 切换期容量/压力混合显式声明(不假装一致) | 可参照 | packages/llm/token-meter/src/projection.ts:19-38 | 展示类指标允许 last-wins 混合，但契约必须写明允许不一致，并明确非计费/非门控 | 契约注释含切换后容量与压力可来自不同时刻；测试断言写允许混合而非必须一致 | C |
| `C-15` | provider 作用域重试预算+Retry-After 上界 | 可参照 | packages/llm/llm/src/retry-policy.ts:17-25,37-79,149-177 与 packages/llm/llm-retry/tests/retry.spec.ts:312,368-397,464,532 | 重试策略按 provider 解析；预算不跨 provider 借用；封顶内 Retry-After 原样用、超封顶落回本地 jittered backoff；非瞬时错误不排定时器 | 超上界 Retry-After 不被采纳；A 的失败不消耗 B 的预算；预算耗尽即停 | C |
| `C-17` | 受限上下文的模型允许清单(治理) | 可参照 | packages/subagent/tool-subagent/src/model-selection-state.ts:31-48 与 packages/subagent/tool-subagent/src/index.ts:361-363 | 对子代理/受限会话引入持久化模型允许清单；空清单必须非法；UI 与宿主校验一致 | 清单外被拒；空清单抛错；受限会话无选择控件；无策略时不误伤 | C |
| `D-04` | spill 三件套（策略/落盘根/取回指引） | 可参照 | packages/spill/spill/lib/index.js:22-51 / spill-local/lib/index.js:17 / spill-policy/lib/index.js:8 | 借三段结构，cap 由产品定 | 两个 cap 数字落文档；溢出后模型可拿到取回提示 | D |
| `D-05` | webhook 入站范式（三 id + credential-ref + 验签先于解析） | 可参照 | packages/webhook/webhook/lib/types/brand.d.ts:4,6,8 / webhook-github/lib/types/handler.js:72,81 | 5a 入站照抄验签→解析→幂等 id；5b 出站自建 | 入站校验先于 body 解析，坏签名夹具可判红 | D |
| `D-06` | HTTP 代理失败必报（never silently dropped） | 可参照 | packages/util/http-proxy/lib/index.js:19,44 | 借 no_proxy 回环清单 + 失败必报 | 代理不可用 = degraded:true + 健康检查可见 | D |
| `D-10` | 时间上下文只做「给模型一只时钟」 | 可参照 | packages/context/time-context/lib/index.js:68 | 复用 Intl 封装与注入面 | 生成时间有；数据时点另立自研（官方无，asOf 命中 0） | D |
| `D-11` | 联网检索官方对应物 dsh-tool-web（结果标外部不可信） | 可参照 | packages/web/tool-web（README.zh.md 概述段） | 归线 #7 补锚点；借不可信标记处置 | 检索结果入上下文带不可信标记，工具缺失时返回结构化错误 | D |

### 4.3 核心自研（2 条）

| ID | 标题 | 分类 | 官方 file:line | 可执行动作 | 我们改到什么程度 | 来源 |
|---|---|---|---|---|---|---|
| `C-23` | 模型选择与我方诊断/专家/哨兵/本体/度量/参数库的边界 | 核心自研 | 借鉴边界(按 G1 守卫与 CTO 口径)，非官方对应物 | 明确可照抄范围:选择器/切换时序/投影/错误处理可参照；涉专家路由、哨兵配额、本体推理、度量口径、参数库一律自研 | 每个涉及上述能力的改动都能指出证据来自我方自有规格或实测，而非官方这么做 | C |
| `D-12` | 凭据本地存储反面范式（仅取「启动即校验权限」）（官方 -local 明文渲染实现建议撤回） | 核心自研 | packages/credentials/credentials-local/lib/index.js:104,343,549-560 | 只借权限自检一条；官方 -local 明文渲染实现撤回不采纳；存储必须加密 | 数据源凭据加密可轮换；权限自检失败即拒绝启动 | D |

---

## 五、官方无实现（5 条，单列，不混入三分类计数）

| ID | 标题 | 分类 | 官方判定（`official` 原文） | 可执行动作 | 我们改到什么程度 | 来源 |
|---|---|---|---|---|---|---|
| `A-16` | 省电挂起（suspend 落盘 / powerSaveBlocker） | 核心自研 | （官方无实现） | 官方只处理 resume，无 suspend 落盘、无 powerSaveBlocker。Synova 自研：suspend 时落盘 run_state，唤醒后据此续跑；仅用户显式长任务期间 prevent-app-suspension，结束即 stop | 挂起→唤醒后 run id 不变且无重复副作用；无长任务时 powerSaveBlocker.isStarted() 为 false；长任务结束 5s 内自动 stop | A |
| `A-38` | 托盘（Tray）官方无实现 → 我方自研 | 核心自研 | （官方无实现） | 自研：Tray+模板图(菜单=打开主窗/暂停哨兵/检查更新/退出)；关窗=隐到托盘、退出=走完整 before-quit 清理；无托盘环境降级为普通窗口并显式 degraded | 关窗后进程仍在且哨兵继续跑；托盘暂停哨兵后 5s 内无新哨兵运行；托盘退出后 ps 无残留；无托盘环境有明确日志与 degraded 标记 | A |
| `C-20` | 限流或失败后自动切换备用模型/provider | 核心自研 | 官方无实现：git grep -E (fallbackModel\|fallbackProvider\|modelFallback\|primaryModel\|secondaryModel\|escalationModel) = 0 命中(见 §5.6)；官方重试停留在失败 provider(retry.spec.ts:464,532) | 自研降级路由:备用顺序、切换判据(终态vs瞬时)、切换后的可见标注、预算与成本账 | 达阈值按序降级且必有可见降级标注；终态配额不盲目重试；全程有可复算的账 | C |
| `C-21` | 切换即中断在飞请求并立即重发 | 核心自研 | 官方无实现：selectModel(packages/api/session-controller/src/commands.ts:133-169)内无 cancel/abort；取消是独立 RPC(commands.ts:499-511，见 §5.6) | 自研切换即生效语义:中断当前生成还是等当前 step 结束、重发策略、半截产出处理与标注 | 切换后可界定时间内停止旧路由产出；半截内容被明确标注而非混入正常输出 | C |
| `C-22` | 每模型工具能力声明与工具集适配 | 核心自研 | 官方无实现：git grep -E (supportsTools\|toolCallSupport\|supportsToolCall\|toolCapability) = 0 命中(见 §5.6)；官方仅声明 contextWindow(packages/llm/llm/src/types.ts:309)与 inputModalities(:313) | 自研模型能力元数据(工具调用/并行调用/结构化输出等)+切换时工具集适配与降级提示 | 切到不支持某工具族的模型时工具集按规则收敛且用户可见提示；不得静默丢工具 | C |

> 口径说明：这 5 条的 `class` 字段在原文件里写的是"核心自研"，**本件不得替作者改分类**，故表格中原样显示；但按 CTO 裁决，它们**在计数上单列**，不进三分类。其"官方无实现"的判定证据在各自切片内（A 条在 A 表 §托盘/省电面；C 条在 C 表 §5.6 canonical 0 命中实测）。

---

## 六、需下游注意的异常项（如实标注，不改内容）

> ⚠️ **机械计数提示**：本节为**派生说明**，其中 `D-11`、`C-23` 已分别计入 §四（`D-11` 在 4.2 可参照、`C-23` 在 4.3 核心自研），**§6.1 的 10 条也全部已在 §四/§五 计入**。机械计数时**不要**再计本节。

| ID | 现象 | 处理 |
|---|---|---|
| `D-11` | `official` 给的是真实官方路径但**无行号**（`packages/web/tool-web（README.zh.md 概述段）`） | 保留原样；提卡时若需精确锚点，须回官方树补行号（**本件不回改**） |
| `C-23` | `official` 非官方对应物，写明是"借鉴边界（按 G1 守卫与 CTO 口径）" | 属**边界声明项**而非官方对应物。**该条计入三分类与否取决于口径，见 §二 的 104 / 103 双口径声明** |

### 6.1 ⚠️ 构建产物路径条目（**确切 10 条**，命令判定，非估算）

**判据**：`official` 字段内出现的路径，在参照系工作树里**磁盘存在**（`ls` 可见）但**不被 pinned commit 跟踪**（`git ls-files --error-unmatch` 失败，`git check-ignore -v` 命中 `.gitignore:7:lib/`，且 `git ls-tree -r --name-only ddefc45 | grep -c "^<path>$"` = 0）。

**受影响条目：10 条，全部来自 D 切片**（A/B/C 三切片 **0 条**）：

| # | ID | 来源 | `official` 中的构建产物路径 | 判定 |
|---|---|---|---|---|
| 1 | `D-01` | D | `packages/runtime-diagnostics/invariants/lib/index.js` | UNTRACKED_IGNORED |
| 2 | `D-03` | D | `packages/util/output-retention/lib/index.js` | UNTRACKED_IGNORED |
| 3 | `D-04` | D | `packages/spill/spill/lib/index.js` | UNTRACKED_IGNORED |
| 4 | `D-05` | D | `packages/webhook/webhook/lib/types/brand.d.ts` | UNTRACKED_IGNORED |
| 5 | `D-06` | D | `packages/util/http-proxy/lib/index.js` | UNTRACKED_IGNORED |
| 6 | `D-07` | D | `packages/settings/settings/lib/types/index.d.ts` | UNTRACKED_IGNORED |
| 7 | `D-08` | D | `packages/session/session-stats/lib/types/projection.js` | UNTRACKED_IGNORED |
| 8 | `D-09` | D | `packages/context/session-reference/lib/index.js` | UNTRACKED_IGNORED |
| 9 | `D-10` | D | `packages/context/time-context/lib/index.js` | UNTRACKED_IGNORED |
| 10 | `D-12` | D | `packages/credentials/credentials-local/lib/index.js` | UNTRACKED_IGNORED |

**统一标注（此 10 条一律适用，提卡与引用时须照写）**：

> **构建产物路径（未被 pinned commit 跟踪；本机可复现 / 干净 checkout 不可复现）**

**判定的原始输出（抽样 2 条，同一命令可复现其余 8 条）**：

```
$ cd /Users/wane/src/deepseek-harness
$ sed -n '1,10p' .gitignore | cat -n
     1  CLAUDE.local.md
     2  .env
     3  apps/desktop/.env.windows
     4  apps/desktop/.env.macos
     5  apps/desktop/*.p12
     6  node_modules/
     7  lib/                       ← 忽略规则在第 7 行
     8  *.tsbuildinfo
     9  pnpm-debug.log
    10  .pnpm-store/

$ ls -l packages/runtime-diagnostics/invariants/lib/index.js
-rw-r--r--@ 1 wane  staff  4851  9月 21 23:57 packages/runtime-diagnostics/invariants/lib/index.js
$ git check-ignore -v packages/runtime-diagnostics/invariants/lib/index.js
.gitignore:7:lib/	packages/runtime-diagnostics/invariants/lib/index.js     (exit=0)
$ git ls-files --error-unmatch packages/runtime-diagnostics/invariants/lib/index.js
error: pathspec 'packages/runtime-diagnostics/invariants/lib/index.js' did not match any file(s) known to git   (exit=1)
$ git ls-tree -r --name-only ddefc45 | grep -c '^packages/runtime-diagnostics/invariants/lib/index.js$'
0

$ ls -l packages/util/output-retention/lib/index.js
-rw-r--r--@ 1 wane  staff  11186  9月 21 23:57 packages/util/output-retention/lib/index.js
$ git check-ignore -v packages/util/output-retention/lib/index.js
.gitignore:7:lib/	packages/util/output-retention/lib/index.js     (exit=0)
$ git ls-files --error-unmatch packages/util/output-retention/lib/index.js
error: pathspec 'packages/util/output-retention/lib/index.js' did not match any file(s) known to git   (exit=1)
```

**"本机可复现"的含义与证据**：磁盘上的构建产物**内容与断言逐行吻合**（即 D 表所核的行号在本机确能命中所声称的代码），故**本机 = 当前官方运行实例**下可复现。抽样：

```
$ sed -n '12p;80p;92p' packages/runtime-diagnostics/invariants/lib/index.js
var InvariantError = class extends Error {                      ← :12
	register(packageName, installer) {                            ← :80  （与 D 表 §1.3 的 claim 一致）
				const installInvariant = (childCtx) => installer(childCtx, (message) => {   ← :92 （同上）
$ sed -n '68p' packages/context/time-context/lib/index.js
function createTimestampFormatter(timeZone) {                    ← :68  （与 D 表 §1.3 dsh-time-context MATCH 一致）
```

**"干净 checkout 不可复现"的含义**：`lib/` 被官方树 `.gitignore:7` 忽略、**不在 pinned commit `ddefc45` 的树里**。因此在一台洁净 clone（只按 pinned commit 检出、未跑过构建）的机器上，这 10 条锚点**指向的文件不存在**，`sed -n` 会失败——**不是断言错误，而是证据面态差异**。

**下游须注意的两点**：
1. **不得**把这 10 条当成"失效引用"（`D 表 §4.2` 的失效清单与它们**无交集**：失效清单判据是"我方引用 vs 官方树"，本组判据是"官方锚点 vs pinned commit 跟踪性"）；
2. **不得**在干净 checkout 环境下用同一命令复算这 10 条并据此判定作者断言不实——须先声明所在断面（运行实例态 / 干净 checkout 态）。

---

## 七、机器可读摘要（供下游机械取用）

本件不重复回显全部 109 条明细（原文即四切片各自的机器可读块，已在 §四/§五 逐条列出）。此处给可机械解析的**计数与索引**：

```json
{
 "d870_borrowing_table": {
  "reference_frame": {
   "tree": "/Users/wane/src/deepseek-harness",
   "tag": "dsh-v0.1.6-alpha.2",
   "commit": "ddefc45fbc7f8e46dd73185e68295696d1297887"
  },
  "total_items": 109,
  "classified_total": 104,
  "classified": {
   "可直接复制": 66,
   "可参照": 36,
   "核心自研": 2
  },
  "official_no_implementation": {
   "count": 5,
   "ids": [
    "A-16",
    "A-38",
    "C-20",
    "C-21",
    "C-22"
   ]
  },
  "class_field_distribution_all_109": {
   "可直接复制": 66,
   "可参照": 36,
   "核心自研": 7
  },
  "per_slice": [
   {
    "slice": "A",
    "file": "docs/synova/research/official-electron-kernel-runtime.md",
    "items": 39,
    "quota": 12,
    "satisfied": true,
    "no_implementation": 2
   },
   {
    "slice": "B",
    "file": "docs/synova/research/official-ui-patterns.md",
    "items": 35,
    "quota": 12,
    "satisfied": true,
    "no_implementation": 0
   },
   {
    "slice": "C",
    "file": "docs/synova/research/official-model-switching.md",
    "items": 23,
    "quota": 10,
    "satisfied": true,
    "no_implementation": 3
   },
   {
    "slice": "D",
    "file": "docs/synova/research/official-borrowing-recheck.md",
    "items": 12,
    "quota": 8,
    "satisfied": true,
    "no_implementation": 0
   }
  ],
  "checks": {
   "sum_equals_total": true,
   "all_quotas_satisfied": true
  },
  "counting_conventions": {
   "convention_A_primary": {
    "criterion": "official 字段字面是否含「官方无实现」",
    "classified_total": 104,
    "classified": {"可直接复制": 66, "可参照": 36, "核心自研": 2},
    "plus_official_no_implementation": 5,
    "sum": 109
   },
   "convention_B_wider": {
    "criterion": "official 是否指向官方对应物（含「非官方对应物」一并剔除）",
    "classified_total": 103,
    "classified": {"可直接复制": 66, "可参照": 36, "核心自研": 1},
    "separately_listed_no_official_counterpart": ["C-23"],
    "plus_official_no_implementation": 5,
    "sum": 109
   },
   "delta_explained_by": ["C-23"]
  },
  "build_artifact_official_paths": {
   "criterion": "official 字段内路径在参照系工作树磁盘存在，但不被 pinned commit ddefc45 跟踪（git ls-files --error-unmatch 失败 + git check-ignore -v 命中 .gitignore:7:lib/）",
   "affected_item_count": 10,
   "affected_ids": ["D-01","D-03","D-04","D-05","D-06","D-07","D-08","D-09","D-10","D-12"],
   "per_slice": {"A": 0, "B": 0, "C": 0, "D": 10},
   "annotation_required": "构建产物路径（未被 pinned commit 跟踪；本机可复现 / 干净 checkout 不可复现）",
   "reproducible_on_this_machine": true,
   "reproducible_on_clean_checkout": false,
   "not_a_dead_reference": true,
   "note": "与 D 表 §4.2 失效清单无交集；失效清单判据为我方引用 vs 官方树，本组判据为官方锚点 vs pinned commit 跟踪性"
  },
  "id_class_index": {
   "A-01": "可直接复制",
   "A-02": "可直接复制",
   "A-03": "可参照",
   "A-04": "可参照",
   "A-05": "可直接复制",
   "A-06": "可直接复制",
   "A-07": "可直接复制",
   "A-08": "可直接复制",
   "A-09": "可直接复制",
   "A-10": "可直接复制",
   "A-11": "可参照",
   "A-12": "可直接复制",
   "A-13": "可直接复制",
   "A-14": "可直接复制",
   "A-15": "可参照",
   "A-16": "核心自研",
   "A-17": "可参照",
   "A-18": "可直接复制",
   "A-19": "可直接复制",
   "A-20": "可直接复制",
   "A-21": "可直接复制",
   "A-22": "可参照",
   "A-23": "可参照",
   "A-24": "可直接复制",
   "A-25": "可参照",
   "A-26": "可直接复制",
   "A-27": "可直接复制",
   "A-28": "可参照",
   "A-29": "可直接复制",
   "A-30": "可直接复制",
   "A-31": "可直接复制",
   "A-32": "可参照",
   "A-33": "可直接复制",
   "A-34": "可直接复制",
   "A-35": "可参照",
   "A-36": "可参照",
   "A-37": "可直接复制",
   "A-38": "核心自研",
   "A-39": "可参照",
   "B-01": "可直接复制",
   "B-02": "可直接复制",
   "B-03": "可直接复制",
   "B-04": "可直接复制",
   "B-05": "可直接复制",
   "B-06": "可直接复制",
   "B-07": "可直接复制",
   "B-08": "可直接复制",
   "B-09": "可参照",
   "B-10": "可直接复制",
   "B-11": "可直接复制",
   "B-12": "可直接复制",
   "B-13": "可参照",
   "B-14": "可直接复制",
   "B-15": "可直接复制",
   "B-16": "可直接复制",
   "B-17": "可参照",
   "B-18": "可直接复制",
   "B-19": "可参照",
   "B-20": "可参照",
   "B-21": "可参照",
   "B-22": "可直接复制",
   "B-23": "可直接复制",
   "B-24": "可直接复制",
   "B-25": "可参照",
   "B-26": "可直接复制",
   "B-27": "可直接复制",
   "B-28": "可参照",
   "B-29": "可直接复制",
   "B-30": "可直接复制",
   "B-31": "可直接复制",
   "B-32": "可直接复制",
   "B-33": "可参照",
   "B-34": "可直接复制",
   "B-35": "可参照",
   "C-01": "可参照",
   "C-02": "可直接复制",
   "C-03": "可参照",
   "C-04": "可参照",
   "C-05": "可参照",
   "C-06": "可直接复制",
   "C-07": "可直接复制",
   "C-08": "可直接复制",
   "C-09": "可直接复制",
   "C-10": "可直接复制",
   "C-11": "可直接复制",
   "C-12": "可直接复制",
   "C-13": "可参照",
   "C-14": "可参照",
   "C-15": "可参照",
   "C-16": "可直接复制",
   "C-17": "可参照",
   "C-18": "可直接复制",
   "C-19": "可直接复制",
   "C-20": "核心自研",
   "C-21": "核心自研",
   "C-22": "核心自研",
   "C-23": "核心自研",
   "D-01": "可直接复制",
   "D-02": "可直接复制",
   "D-03": "可直接复制",
   "D-04": "可参照",
   "D-05": "可参照",
   "D-06": "可参照",
   "D-07": "可直接复制",
   "D-08": "可直接复制",
   "D-09": "可直接复制",
   "D-10": "可参照",
   "D-11": "可参照",
   "D-12": "核心自研"
  },
  "source_files": {
   "A": "docs/synova/research/official-electron-kernel-runtime.md",
   "B": "docs/synova/research/official-ui-patterns.md",
   "C": "docs/synova/research/official-model-switching.md",
   "D": "docs/synova/research/official-borrowing-recheck.md"
  }
 }
}
```

---

**本件边界**：机械聚合产物，不含代码改动、不含依赖引入、不含"通过"评语；`docs/synova/research/official-borrowing-table.md` 为本件写入文件之一（另一份为 `official-change-cards.md`）。是否可采用、能否合并，归 CTO 收件闸与 K3 终审。
