# PLATFORM-CHECKLIST — 控制塔跨平台适配清单（D520 任务3）

> 2026-08-24 立 | 防第四次平台复发（08-16 起 3 次并行复发病根 = CRLF 算术错误）
> 规则：**新增/修改 scripts/control-tower/ 或 scripts/workflow/ 下脚本前过一遍本清单**；
> pre-commit 软检查（V5 平台敏感命令）会在新脚本含裸平台命令时点名本文件。

## ✅ 8 条清单（每条：为什么 / 修法示例）

### 1. PYBIN 三级探测（禁裸 python3）
- **为什么**：Windows 部分机器无 python3.exe（仅 python / py -3）；损坏 shim 探存在性不探可用性会静默漏拦（D328/D513）。
- **修法**：
  ```bash
  PYBIN=""
  for _c in python3 python py; do
    command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1 && PYBIN="$_c" && break
  done
  [ -z "$PYBIN" ] && echo "⚠ python 不可用 — 显式降级"  # 铁律 11：不静默
  ```

### 2. CRLF 清洗（python/命令输出进算术/比较前必清）
- **为什么**：Windows 下管道输出带 `\r`，`[[ "3\r" -gt 0 ]]` 算术错误 → 拦截空转（D520 P0，并行隔离 3 次复发病根）。
- **修法**：
  ```bash
  N="$(... | tr -d '\r\n' || echo "")"   # 一次清洗
  N="${N//[^0-9]/}"                       # 二次清洗——只留数字
  ```

### 3. 路径处理（git -c core.quotepath=false）
- **为什么**：中文文件名默认被 git 转义成八进制，grep 匹配断裂（D339）。
- **修法**：`git -c core.quotepath=false diff --cached --name-only`；跨仓库定位脚本用 `$(dirname BASH_SOURCE)` 而非 `$ROOT`（D317）。

### 4. UTF-8 强制（脚本头三行）
- **为什么**：Windows 控制台/子进程默认 GBK，中文输出乱码导致 grep 断言失败（D313 M5）。
- **修法**：每个脚本头部：
  ```bash
  export PYTHONIOENCODING=utf-8
  export LC_ALL=C.UTF-8 2>/dev/null || true
  ```

### 5. date 兼容（macOS BSD vs GNU）
- **为什么**：macOS 无 `date -d`、GNU 无 `date -v`；跨天/时区窗口计算漂移（D366/D503/D506）。
- **修法**：优先 python3 算日期窗口（`datetime.date.today() + timedelta`）；或探测后分支。

### 6. mktemp 沙箱（tests 专用）
- **为什么**：测试写真实仓库 = 污染宿主（M13：GIT_DIR 只隔 index 不隔 config，4 次污染事故）。
- **修法**：`TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT`；git 身份一律 `git -c user.name=t -c user.email=t@t`，**禁 `git config` 持久写入**。

### 7. grep -P 不可用（macOS BSD grep）
- **为什么**：BSD grep 无 `-P`（PCRE），`grep -oP` 在 mac 直接报错（D313）。
- **修法**：用 `grep -oE` + `sed` 替代；或 bash `[[ =~ ERE ]]`（D506：`=~` RHS runtime 展开按 ERE 解析，| alternation 生效）。

### 8. timeout 缺失（macOS 无 GNU timeout）
- **为什么**：macOS 无 `timeout`，外层超时防门禁卡死失效（D334）。
- **修法**：`for _c in timeout gtimeout; do command -v $_c ...` 探测；无则显式降级提示"无外层超时直接执行"。

## 附：已知双平台安全命令（Git Bash on Windows 均有）
`mktemp` / `date -Iseconds` / `tr` / `sed` / `awk` / `basename` / `dirname`
（跑不通的测试加平台守卫：`uname | grep -qi MINGW && skip 并计数`）
