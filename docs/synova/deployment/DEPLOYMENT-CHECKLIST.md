# SynovaAgent 部署检查清单

> 适用版本: V4.5.0 | 更新日期: 2026-07-26
> 客户交付截止线: 10/31

---

## 1. 环境要求

| 组件 | 最低版本 | 验证命令 |
|------|---------|---------|
| Node.js | 22+ | `node --version` |
| Python | 3.11+ | `python --version` |
| npm | 10+ | `npm --version` |
| Git | 2.40+ | `git --version` |
| 操作系统 | Windows 10+/macOS 13+/Ubuntu 22.04+ | — |

**可选工具:**
- TypeScript 5.5+（`npx tsc --version`）
- better-sqlite3 原生依赖: macOS 需 Xcode CLI Tools，Ubuntu 需 `build-essential`

---

## 2. 获取代码

```bash
# 克隆仓库
git clone <repository-url> synova-agent
cd synova-agent

# 切换到部署分支
git checkout feat/prompt-architecture
```

---

## 3. 安装依赖

```bash
npm install
```

安装过程自动执行 `postinstall` 脚本（`patch-package`），适配当前平台。

> **故障处理:** 如果 better-sqlite3 编译失败，请确认已安装 C++ 编译工具链。
> - Windows: `npm install --global windows-build-tools`
> - macOS: `xcode-select --install`
> - Ubuntu: `sudo apt install build-essential python3`

---

## 4. 环境快照

首次部署前生成环境快照，记录当前工具版本:

```bash
python scripts/control-tower/env_validator.py snapshot
```

验证快照一致性:

```bash
python scripts/control-tower/env_validator.py validate
```

> **预期输出:** `[PASS] Consistent` — 表示环境与快照一致。
> 如不一致请检查工具版本后重新生成快照。

---

## 5. 启动系统

```bash
npm run dev
```

启动流程自动执行:
1. 控制塔信号初始化（D230）
2. 环境验证（D217）
3. 契约门禁（D217）
4. 写入锁准备（D209）
5. Agent 主进程启动

> 首次启动可能因 `env-snapshot.json` 不匹配而提示环境验证失败。
> 按提示运行 `python scripts/control-tower/env_validator.py snapshot` 后重试。

---

## 6. 验证服务

服务启动后，浏览器访问:

| 地址 | 说明 |
|------|------|
| `http://localhost:3000/app/login.html` | 登录/注册页面 |
| `http://localhost:3000/app/dashboard.html` | 企业仪表盘 |
| `http://localhost:3000/cockpit` | 创始人驾驶舱（控制塔） |

> 默认端口为 `3000`，可通过 `PORT` 环境变量修改:
> ```bash
> PORT=8080 npm run dev
> ```

---

## 7. 验证门禁

运行门禁检查确认系统完整性:

```bash
python scripts/audit/check-gates-v2.py
```

> 17 个门禁全部 `PASS` 表示系统正常。
> 部分门禁 `PARTIAL` 属于正常范围（需要运行积累数据）。

---

## 故障排除

| 症状 | 可能原因 | 解决 |
|------|---------|------|
| 端口被占用 | 默认 3000 已被使用 | `PORT=8080 npm run dev` |
| better-sqlite3 编译错误 | 缺少 C++ 工具链 | 见第 3 步故障处理 |
| 启动时环境验证失败 | 环境发生过变化 | `python scripts/control-tower/env_validator.py snapshot` |
| 登录后页面空白 | JWT Secret 未配置 | 检查 `synova.json` 配置文件 |

---

## 参考

- [首次诊断引导](./FIRST-DIAGNOSIS-GUIDE.md) — 首次使用系统的完整流程
- [部署演练](../../../scripts/workflow/checkpoint-deploy.sh) — 部署验证脚本
- 环境验证器 — `python scripts/control-tower/env_validator.py --help`
