# FEISHU-BRIDGE 入库 — 飞书↔Codex 对话桥 v2.0（2026-08-22）

## Q0: 定位
SynovaAgent 运维工具（scripts/feishu-bridge/）——飞书机器人 ↔ Codex 对话桥，供内部/客户对话使用

## Q1: 调研
MACBOOK-SETUP.md:97 与 DASHBOARD 已引用 `scripts/feishu-bridge/feishu_bridge.py` 但文件从未入库（悬空引用）；脚本 v2.0（2026-08-07，lark-cli 版）为成品（README + 配置模板 + 日志/超时/白名单齐全）
## Q2: 范围
做什么
- scripts/feishu-bridge/feishu_bridge.py
- scripts/feishu-bridge/README.md
- scripts/feishu-bridge/config.example.env
- scripts/feishu-bridge/requirements.txt
不做什么
- 不修改本机运行时文件（.env / *.log / __pycache__）— 已被 .gitignore 覆盖，不入库
- 不涉及客户数据与真实凭据
- 不修改 synova_worker/connectors/feishu.py（既有飞书连接器）
- 不修改 scripts/control-tower（DSH 地盘）
- 不修改 scripts/coordination/（DSH 地盘）
- 不修改 src/
- 不修改 scripts/workflow/
- 不修改 scripts/ 其他目录
- 不修改 .claude/skills/ .dsh/skills/
- 不修改 .github/
- 不修改 docs/
- 不修改 .codex/
- 不修改 tests/
- 不修改 task-state/
- 不修改 AGENTS.md
- 不修改 VERSION.md
- 不修改 version.log
- 不修改 memory/
- 不修改 .gitignore
- 不修改 package.json
- 不修改 extensions/
- 不修改 packages/
- 不修改 knowledge/
- 不修改 .claude/task-briefs/ 除本文件
- 不修改 .claude/bypass.log 除补记
- 不修改 .claude/plan.json
- 不修改 .claude/reference-map.md
- 不修改 .claude/current-brief
- 不修改根目录其他文件
- 不修改 .venv*/
- 不修改 node_modules/
- 不修改 dist/
- 不修改 coverage/
- 不修改 tmp/

## Q3: 验收
入口=`python scripts/feishu-bridge/feishu_bridge.py`（MACBOOK-SETUP 引用路径可解析）；交互=飞书消息→Codex 转发→回复；结果=脚本入库 + README/配置模板齐全 + 悬空引用修复

## 架构层:
运维工具层（scripts/），不涉 src 五层

## 接口审计
feishu_bridge.py 依赖 lark-cli + codex CLI（README 前置条件写明）；@larksuite/cli 非仓库依赖（全局安装，文档注明）；无 src/ 引用

## Done 标准
- grep -rn "scripts/feishu-bridge" docs/synova/setup/MACBOOK-SETUP.md 命中
- git ls-files scripts/feishu-bridge 恰 4 文件
- pre-commit 全过；secrets 扫描不含真实凭据
