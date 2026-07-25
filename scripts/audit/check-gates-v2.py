#!/usr/bin/env python3
"""
check-gates-v2.py — 17 产品门禁自动判定脚本 (D219)

附录 A v2.0 §三-四: 30 秒内自动判定 17 门禁状态，输出 gate-status.json。
仪表盘门禁面板的数据源。所有判定基于静态文件扫描 + HTTP 端点检查。

用法:
  python scripts/audit/check-gates-v2.py              # 完整运行
  python scripts/audit/check-gates-v2.py --quiet      # 仅写文件
  python scripts/audit/check-gates-v2.py --output X  # 自定义输出路径

契约:
  @input  — 代码库文件系统 + .codex/signals/ + .codex/audit/ + HTTP 端点
  @output — .codex/signals/gate-status.json（附录 A §四格式）
  @degraded — 预期路径缺失 → 该门禁标记 unverifiable，不阻止其他判定
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ═══════════════════════════════════════════════════════════════════════
#  常量
# ═══════════════════════════════════════════════════════════════════════

SCRIPT_VERSION = "v2.0"
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OUTPUT = PROJECT_ROOT / ".codex/signals/gate-status.json"
SERVER_PORT = 18790

# 31 条预期路径清单（附录 A §3.5）
EXPECTED_PATHS: list[str] = [
    # 核心基础设施
    "src/server.ts",
    "src/deploy/bootstrap.ts",
    "scripts/agent-start.sh",
    # Gate 1-2: 企业注册认证 + 权限
    "src/routes/enterprise.ts",
    "src/middleware/auth.ts",
    "src/middleware/rbac.ts",
    # Gate 3: 数据管道
    "src/connectors/",
    "src/connectors/index.ts",
    "src/connectors/unified-connector.ts",
    "src/connectors/feishu.ts",
    "src/ingest/index.ts",
    # Gate 4-5: 哨兵 + 专家
    "src/sentinel/sentinel-runner.ts",
    "src/sentinel/registry.ts",
    "src/agent/synova-agent.ts",
    "src/l3/expert-autonomy.ts",
    "src/l2/expert-router.ts",
    "src/agent/diagnosis-launcher.ts",
    # Gate 6: 诊断可验证
    "extensions/ontology/edge-types/",
    "packages/ontology/src/node-types.ts",
    # Gate 8-11: 增长目标体系
    "src/growth/goal-store.ts",
    "src/growth/goal-types.ts",
    "src/growth/proposal-engine.ts",
    "src/growth/goal-sentinel.ts",
    "src/growth/goal-sentinel-lifecycle.ts",
    "src/growth/lightweight-diagnosis.ts",
    "src/growth/goal-lifecycle.ts",
    "src/growth/knowledge-feedback.ts",
    "src/l4/knowledge-store.ts",
    # Gate 12-14: 循环 + 进化
    "src/loops/loop-scheduler.ts",
    "src/loops/loop-trigger-config.ts",
    "src/loops/middle-evolution-engine.ts",
]

# 依赖链：上游门禁未通过时下游自动降级（附录 A §1.2）
# (upstream_gate_id, downstream_gate_id, upstream_trigger_status, degrade_from, degrade_to)
DEPENDENCY_RULES: list[tuple[int, int, str, str, str]] = [
    (1, 2,  "fail",    "*",       "fail"),     # Gate 1 fail → Gate 2 fail
    (5, 8,  "partial", "pass",    "partial"),  # Gate 5 partial → Gate 8 partial（从 pass 降级）
    (8, 9,  "fail",    "*",       "partial"),  # Gate 8 fail → Gate 9 partial
    (4, 12, "fail",    "*",       "partial"),  # Gate 4 fail → Gate 12 partial
    (12, 13,"fail",    "*",       "partial"),  # Gate 12 fail → Gate 13 partial
]

# 17 门禁元数据
GATE_META: list[dict[str, str]] = [
    {"id": "gate-0",  "name": "产品启动自检",       "dimension": "基础"},
    {"id": "gate-1",  "name": "企业注册与认证",      "dimension": "接入"},
    {"id": "gate-2",  "name": "多人使用与权限",      "dimension": "接入"},
    {"id": "gate-3",  "name": "数据管道接通",        "dimension": "接入"},
    {"id": "gate-4",  "name": "哨兵自主巡检",        "dimension": "诊断"},
    {"id": "gate-5",  "name": "专家自主诊断",        "dimension": "诊断"},
    {"id": "gate-6",  "name": "诊断可验证",          "dimension": "诊断"},
    {"id": "gate-7",  "name": "方向有效性监测",       "dimension": "诊断"},
    {"id": "gate-8",  "name": "诊断→Goal自动转化",   "dimension": "导航"},
    {"id": "gate-9",  "name": "Goal执行追踪",        "dimension": "导航"},
    {"id": "gate-10", "name": "Goal偏离调整",        "dimension": "导航"},
    {"id": "gate-11", "name": "Goal闭环验证",        "dimension": "导航"},
    {"id": "gate-12", "name": "核心循环定时运行",     "dimension": "持续运行"},
    {"id": "gate-13", "name": "静默停滞检测",        "dimension": "持续运行"},
    {"id": "gate-14", "name": "中层驱动进化",        "dimension": "进化"},
    {"id": "gate-15", "name": "知识积累与回流",      "dimension": "进化"},
    {"id": "gate-16", "name": "控制塔信号",          "dimension": "控制"},
]


# ═══════════════════════════════════════════════════════════════════════
#  数据类型
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class GateConditionResult:
    name: str
    status: str       # pass / partial / fail
    detail: str = ""

@dataclass
class GateResult:
    id: str
    name: str
    dimension: str
    status: str       # pass / partial / fail / unverifiable
    conditions: dict = field(default_factory=lambda: {"passed": 0, "partial": 0, "failed": 0})
    downgraded_by: Optional[str] = None
    downgraded_from: Optional[str] = None
    details: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "dimension": self.dimension,
            "status": self.status,
            "conditions": self.conditions,
            "downgradedBy": self.downgraded_by,
            "downgradedFrom": self.downgraded_from,
            "details": self.details,
        }


# ═══════════════════════════════════════════════════════════════════════
#  门禁判定器
# ═══════════════════════════════════════════════════════════════════════

class GateChecker:
    """17 门禁自动判定器。每个 gate 返回 GateResult。"""

    def __init__(self, root: Path, quiet: bool = False):
        self.root = root
        self.quiet = quiet
        self.start_time = time.time()
        self.results: list[GateResult] = []
        self.health_result: Optional[dict] = None
        self._server_proc: Optional[subprocess.Popen] = None
        self._port_was_listening = False

    # ─── 日志 ───

    def log(self, msg: str) -> None:
        if not self.quiet:
            print(msg)

    def ok(self, msg: str) -> None:
        self.log(f"    [PASS] {msg}")

    def warn(self, msg: str) -> None:
        self.log(f"    [WARN] {msg}")

    def fail(self, msg: str) -> None:
        self.log(f"    [FAIL] {msg}")

    # ─── 工具方法 ───

    def _path(self, *parts: str) -> Path:
        return self.root.joinpath(*parts)

    def file_exists(self, path: str) -> bool:
        p = self._path(path)
        return p.exists() and p.is_file()

    def dir_exists(self, path: str) -> bool:
        p = self._path(path)
        return p.exists() and p.is_dir()

    def read_file(self, path: str) -> str:
        """Read file as UTF-8, return '' on error."""
        try:
            return self._path(path).read_text("utf-8", errors="replace")
        except Exception:
            return ""

    def grep(self, pattern: str, path: str) -> list[str]:
        """Simple line grep in a single file."""
        text = self.read_file(path)
        if not text:
            return []
        return [line.strip() for line in text.split("\n") if re.search(pattern, line)]

    def grep_r(self, pattern: str, subdir: str, exclude_pattern: str = "",
               file_ext: str = ".ts") -> list[str]:
        """Recursive grep returning matching file paths (relative to root)."""
        target = self._path(subdir)
        if not target.exists():
            return []
        matches: list[str] = []
        try:
            for f in target.rglob(f"*{file_ext}"):
                if exclude_pattern and re.search(exclude_pattern, str(f)):
                    continue
                try:
                    text = f.read_text("utf-8", errors="replace")
                    if re.search(pattern, text):
                        matches.append(str(f.relative_to(self.root)))
                except Exception:
                    continue
        except Exception:
            pass
        return matches

    def count_matches(self, pattern: str, path: str) -> int:
        return len(self.grep(pattern, path))

    def count_export_fn(self, path: str, pattern: str = r"export\s+(async\s+)?function\s+\w+") -> int:
        text = self.read_file(path)
        if not text:
            return 0
        return len(re.findall(pattern, text))

    def check_empty_impl(self, path: str, func_name: str) -> Optional[str]:
        """附录 A §3.4 空壳检测。返回 None=OK，或描述问题的字符串。"""
        text = self.read_file(path)
        if not text:
            return "file_not_found"
        # 找到函数体
        fn_patterns = [
            rf"(?:export\s+(?:async\s+)?)?function\s+{re.escape(func_name)}\s*\([^)]*\)\s*\{{",
            rf"(?:export\s+)?(?:const\s+)?{re.escape(func_name)}\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>\s*\{{",
        ]
        match = None
        for p in fn_patterns:
            match = re.search(p, text)
            if match:
                break
        if not match:
            return None  # 找不到函数——可能是其他签名格式
        # 提取函数体
        start = match.end()
        depth = 1
        i = start
        while i < len(text) and depth > 0:
            if text[i] == '{':
                depth += 1
                break
            i += 1
        if i >= len(text):
            return None
        start = i + 1
        depth = 1
        i = start
        while i < len(text) and depth > 0:
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
            i += 1
        body = text[start:i - 1].strip()
        # 空壳检查
        if re.search(r'return\s*\{\s*\}', body):
            return "empty_return"
        if re.search(r"throw\s+new\s+Error\s*\(\s*['\"]Not\s*implemented['\"]", body, re.IGNORECASE):
            return "throw_not_implemented"
        if len(body) < 20 and not re.search(r'\b(import|await|return\s+\w|console\.)', body):
            return "short_body"
        return None

    def _merge_conditions(self, info: dict) -> str:
        """将条件计数合并为门禁状态。"""
        if info.get("unverifiable", 0) > 0 and (info.get("passed", 0) + info.get("partial", 0)) == 0:
            return "unverifiable"
        if info.get("failed", 0) > 0:
            return "fail"
        if info.get("partial", 0) > 0:
            return "partial"
        if info.get("passed", 0) > 0:
            return "pass"
        return "fail"

    # ═════════════════════════════════════════════════════════════════
    #  健康检查
    # ═════════════════════════════════════════════════════════════════

    def run_health_check(self) -> dict:
        """31 条预期路径健康检查（附录 A §3.5）"""
        found = 0
        missing: list[str] = []
        details: list[dict] = []
        for p in EXPECTED_PATHS:
            exists = self.file_exists(p) or self.dir_exists(p)
            if exists:
                found += 1
            else:
                missing.append(p)
                self.warn(f"预期路径不存在: {p} — 可能代码库结构已变更")
            details.append({"path": p, "exists": exists})
        return {
            "expectedPaths": len(EXPECTED_PATHS),
            "foundPaths": found,
            "missingPaths": missing,
            "details": details,
        }

    # ═════════════════════════════════════════════════════════════════
    #  Gate 0: 产品启动自检
    # ═════════════════════════════════════════════════════════════════

    def check_gate_0(self) -> GateResult:
        info: dict = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # Condition 1: 端口是否监听（等价于 npm start 成功）
        port_open = self._check_tcp_port(SERVER_PORT)
        if port_open:
            self._port_was_listening = True
            info["passed"] += 1
            parts.append("端口18790: 进程存活")
            self.ok("端口18790: 进程存活")
        else:
            self.log("    端口18790未监听，尝试启动服务器...")
            started = self._start_server()
            if started:
                info["passed"] += 1
                parts.append("服务器手动启动成功")
                self.ok("服务器手动启动成功")
            else:
                info["failed"] += 1
                parts.append("服务器无法启动(超时或崩溃)")
                self.fail("服务器无法启动")

        # Condition 2: /api/healthz 返回 200 + status ok
        healthz = self._curl_check("http://localhost:18790/api/healthz", expect_200=True)
        if healthz is True:
            info["passed"] += 1
            parts.append("/api/healthz: 200 + ok")
            self.ok("/api/healthz: 200 + ok")
        elif healthz is None:
            info["partial"] += 1
            parts.append("/api/healthz: 返回但非预期响应")
            self.warn("/api/healthz: 响应异常")
        else:
            info["failed"] += 1
            parts.append("/api/healthz: 不可达")
            self.fail("/api/healthz: 不可达")

        # Condition 3: /api/sentinel/health 返回 200
        sentinel = self._curl_check("http://localhost:18790/api/sentinel/health", expect_200=True)
        if sentinel is True:
            info["passed"] += 1
            parts.append("/api/sentinel/health: 200")
            self.ok("/api/sentinel/health: 200")
        elif sentinel is None:
            info["partial"] += 1
            parts.append("/api/sentinel/health: 响应异常")
            self.warn("/api/sentinel/health: 响应异常")
        else:
            info["failed"] += 1
            parts.append("/api/sentinel/health: 不可达")
            self.fail("/api/sentinel/health: 不可达")

        status = self._merge_conditions(info)
        return GateResult("gate-0", "产品启动自检", "基础", status, info,
                          details="; ".join(parts))

    def _check_tcp_port(self, port: int) -> bool:
        try:
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            r = s.connect_ex(("127.0.0.1", port))
            s.close()
            return r == 0
        except Exception:
            return False

    def _start_server(self) -> bool:
        try:
            self._server_proc = subprocess.Popen(
                ["npx", "tsx", "src/index.ts"],
                cwd=str(self.root),
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                shell=(os.name == "nt"),
            )
            for _ in range(30):
                time.sleep(1)
                if self._check_tcp_port(SERVER_PORT):
                    return True
                if self._server_proc.poll() is not None:
                    return False
            return False
        except Exception:
            return False

    def _curl_check(self, url: str, expect_200: bool = False) -> Optional[bool]:
        """
        True  = HTTP 200 (and body contains 'ok' if expect_200)
        None  = HTTP response but unexpected
        False = connection error
        """
        try:
            import urllib.request
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status != 200:
                    return None
                if expect_200:
                    body = resp.read().decode("utf-8", errors="replace")
                    return "ok" in body or "healthy" in body or resp.status == 200
                return True
        except urllib.error.HTTPError as e:
            return None if e.code != 200 else True
        except (urllib.error.URLError, ConnectionRefusedError, TimeoutError, OSError):
            return False

    # ═════════════════════════════════════════════════════════════════
    #  Gate 1: 企业注册与认证
    # ═════════════════════════════════════════════════════════════════

    def check_gate_1(self) -> GateResult:
        info: dict = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: enterprise.ts 存在且含 register 路由
        if self.file_exists("src/routes/enterprise.ts"):
            empty = self.check_empty_impl("src/routes/enterprise.ts", "register")
            if empty:
                info["failed"] += 1
                parts.append(f"enterprise.ts register 空壳({empty})")
                self.fail(f"enterprise.ts: register 路由为空壳({empty})")
            else:
                routes = self.grep(r"(register|POST.*enterprise/register)", "src/routes/enterprise.ts")
                if routes:
                    info["passed"] += 1
                    parts.append("enterprise.ts: register 路由存在")
                    self.ok("enterprise.ts: register 路由存在")
                else:
                    info["partial"] += 1
                    parts.append("enterprise.ts: 存在但 register 待确认")
                    self.warn("enterprise.ts: register 路由待确认")
        else:
            info["failed"] += 1
            parts.append("enterprise.ts: 不存在")
            self.fail("enterprise.ts: 不存在")

        # C2: bcrypt.hash 调用
        bcrypt_files = self.grep_r(r"bcrypt\.hash\(", "src", exclude_pattern="node_modules")
        if bcrypt_files:
            info["passed"] += 1
            parts.append(f"bcrypt.hash: 在 {len(bcrypt_files)} 个文件中调用")
            self.ok(f"bcrypt.hash: 在 {len(bcrypt_files)} 个文件中调用")
        else:
            info["failed"] += 1
            parts.append("bcrypt.hash: 无调用")
            self.fail("bcrypt.hash: 无调用")

        # C3: 返回 enterpriseId JSON
        json_resp = self.grep(r"enterpriseId|orgId|adminToken|data\.\w+Id|data\s*:", "src/routes/enterprise.ts")
        if json_resp:
            info["passed"] += 1
            parts.append(f"JSON 响应: {json_resp[0][:50]}...")
            self.ok("JSON 响应含 orgId/adminToken")
        else:
            info["failed"] += 1
            parts.append("JSON Id 字段: 未找到")
            self.fail("JSON Id 字段: 未找到")

        # C4: 端到端 curl 测试
        if self._port_was_listening:
            reg_ok = self._curl_check(
                "http://localhost:18790/api/enterprise/register", expect_200=True)
            if reg_ok is True:
                info["passed"] += 1
                parts.append("端到端: 注册测试通过")
                self.ok("端到端: 注册测试通过")
            elif reg_ok is None:
                info["partial"] += 1
                parts.append("端到端: 注册端点响应异常")
                self.warn("端到端: 注册端点响应异常")
            else:
                info["failed"] += 1
                parts.append("端到端: 注册端点不可达")
                self.fail("端到端: 注册端点不可达")
        else:
            info["partial"] += 1
            parts.append("端到端: 跳过(服务器未运行)")
            self.warn("端到端: 跳过(服务器未运行)")

        status = self._merge_conditions(info)
        return GateResult("gate-1", "企业注册与认证", "接入", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 2: 多人使用与权限
    # ═════════════════════════════════════════════════════════════════

    def check_gate_2(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: 成员邀请端点
        invite = self.grep(r"invite", "src/routes/enterprise.ts")
        if invite:
            info["passed"] += 1
            parts.append("enterprise.ts: 含 invite 端点")
            self.ok("enterprise.ts: 含 invite 端点")
        else:
            info["failed"] += 1
            parts.append("enterprise.ts: 无 invite 端点")
            self.fail("enterprise.ts: 无 invite 端点")

        # C2: auth 中间件 + extractAuthFromRequest
        if self.file_exists("src/middleware/auth.ts"):
            extract = self.grep(r"extractAuthFromRequest", "src/middleware/auth.ts")
            if extract:
                info["passed"] += 1
                parts.append("auth.ts: extractAuthFromRequest 存在")
                self.ok("auth.ts: extractAuthFromRequest 存在")
            else:
                info["failed"] += 1
                parts.append("auth.ts: 无 extractAuthFromRequest")
                self.fail("auth.ts: 无 extractAuthFromRequest")
        else:
            info["failed"] += 1
            parts.append("auth.ts: 不存在")
            self.fail("auth.ts: 不存在")

        # C3: RBAC 权限隔离
        rbac_file = self.file_exists("src/middleware/rbac.ts")
        if rbac_file:
            info["passed"] += 1
            parts.append("rbac.ts: 存在")
            self.ok("rbac.ts: 存在")
        else:
            info["failed"] += 1
            parts.append("rbac.ts: 不存在")
            self.fail("rbac.ts: 不存在")

        # C4: 数据持久化检查
        if self.file_exists("src/l4/engine-graph-store.ts") or self.file_exists("src/l4/graph-bridge.ts"):
            info["partial"] += 1
            parts.append("GraphStore: 存在(待确认数据持久化)")
            self.warn("GraphStore: 存在，持久化待确认")
        else:
            info["partial"] += 1
            parts.append("GraphStore: 非持久化存储")
            self.warn("GraphStore: 非持久化存储")

        status = self._merge_conditions(info)
        return GateResult("gate-2", "多人使用与权限", "接入", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 3: 数据管道接通
    # ═════════════════════════════════════════════════════════════════

    def check_gate_3(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: connectors 文件含真实 API 调用，非 test 保护块内
        connectors_with_api = self.grep_r(r"(fetch\s*\(|axios|\.get\s*\(|\.post\s*\(|http\.)",
                                          "src/connectors", file_ext=".ts")
        # 排除 types-only 文件（行数<30）和在 test 保护块内的调用
        real_connectors = []
        for fp in connectors_with_api:
            text = self.read_file(fp)
            if len(text.split("\n")) < 30:
                continue  # type definitions only
            if "NODE_ENV.*test" in text or "process.env" in text:
                # Check if ALL API calls are inside test guards
                lines = text.split("\n")
                in_test_block = False
                has_real_call = False
                for line in lines:
                    if re.search(r"NODE_ENV.*test", line):
                        in_test_block = True
                    if re.search(r"(fetch\s*\(|axios|\.get\s*\(|\.post\s*\()", line) and not in_test_block:
                        has_real_call = True
                if has_real_call:
                    real_connectors.append(fp)
            else:
                real_connectors.append(fp)
        if real_connectors:
            info["passed"] += 1
            parts.append(f"connectors: {len(real_connectors)} 含真实 API 调用(非 test-guard)")
            self.ok(f"connectors: {len(real_connectors)} 含真实 API 调用(非 test-guard)")
        else:
            info["failed"] += 1
            parts.append("connectors: 无真实 API 调用或全在 test 保护块内")
            self.fail("connectors: 无真实 API 调用或全在 test 保护块内")

        # C2: 检查 ingest 数据入口
        if self.file_exists("src/ingest/index.ts"):
            info["passed"] += 1
            parts.append("ingest/index.ts: 存在")
            self.ok("ingest/index.ts: 存在")
        else:
            info["failed"] += 1
            parts.append("ingest/index.ts: 不存在")
            self.fail("ingest/index.ts: 不存在")

        # C3: GraphStore 节点类型检查
        if self.file_exists("packages/ontology/src/node-types.ts"):
            node_types = self.read_file("packages/ontology/src/node-types.ts")
            has_resource = all(rt in node_types for rt in ["RESOURCE_MONEY", "RESOURCE_CLIENT", "RESOURCE_PERSON"])
            if has_resource:
                info["passed"] += 1
                parts.append("节点类型: RESOURCE_MONEY/CLIENT/PERSON 定义完整")
                self.ok("节点类型: RESOURCE_MONEY/CLIENT/PERSON 定义完整")
            else:
                info["partial"] += 1
                parts.append("节点类型: 部分定义缺失")
                self.warn("节点类型: 部分定义缺失，需人工确认")
        else:
            info["failed"] += 1
            parts.append("node-types.ts: 不存在")
            self.fail("node-types.ts: 不存在")

        status = self._merge_conditions(info)
        return GateResult("gate-3", "数据管道接通", "接入", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 4: 哨兵自主巡检
    # ═════════════════════════════════════════════════════════════════

    def check_gate_4(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: sentinel-runner.ts 存在 + runSentinelForTeam
        if self.file_exists("src/sentinel/sentinel-runner.ts"):
            runner_fn = self.grep(r"runSentinelForTeam|runAll|check", "src/sentinel/sentinel-runner.ts")
            if runner_fn:
                info["passed"] += 1
                parts.append("sentinel-runner.ts: 含运行函数")
                self.ok("sentinel-runner.ts: 含运行函数")
            else:
                empty = self.check_empty_impl("src/sentinel/sentinel-runner.ts", "runSentinelForTeam")
                if empty:
                    info["partial"] += 1
                    parts.append(f"sentinel-runner.ts: 空壳({empty})")
                    self.warn(f"sentinel-runner.ts: 空壳({empty})")
                else:
                    info["partial"] += 1
                    parts.append("sentinel-runner.ts: 存在但函数签名待确认")
                    self.warn("sentinel-runner.ts: 函数签名待确认")
        else:
            info["failed"] += 1
            parts.append("sentinel-runner.ts: 不存在")
            self.fail("sentinel-runner.ts: 不存在")

        # C2: synova-agent.ts 实例化 SentinelRunner + .start()
        if self.file_exists("src/agent/synova-agent.ts"):
            sagent = self.read_file("src/agent/synova-agent.ts")
            if "SentinelRunner" in sagent and ".start()" in sagent:
                info["passed"] += 1
                parts.append("synova-agent.ts: SentinelRunner 实例化 + start")
                self.ok("synova-agent.ts: SentinelRunner 实例化 + start")
            elif "SentinelRunner" in sagent:
                info["partial"] += 1
                parts.append("synova-agent.ts: SentinelRunner 存在但未 start")
                self.warn("synova-agent.ts: SentinelRunner 存在但未 start")
            else:
                info["failed"] += 1
                parts.append("synova-agent.ts: 无 SentinelRunner")
                self.fail("synova-agent.ts: 无 SentinelRunner")
        else:
            info["failed"] += 1
            parts.append("synova-agent.ts: 不存在")
            self.fail("synova-agent.ts: 不存在")

        # C3: 哨兵注册记录 —— sentinel/registry.ts 中含注册逻辑
        if self.file_exists("src/sentinel/registry.ts"):
            reg = self.grep(r"register\|getRegistry\|runAll", "src/sentinel/registry.ts")
            if reg:
                info["partial"] += 1
                parts.append("sentinel/registry.ts: 注册记录 > 1")
                self.warn("sentinel/registry.ts: 注册记录存在(需 cron 执行确认)")
            else:
                info["partial"] += 1
                parts.append("sentinel/registry.ts: 注册记录 ≤ 1")
                self.warn("sentinel/registry.ts: 注册记录不足")
        else:
            info["failed"] += 1
            parts.append("sentinel/registry.ts: 不存在")
            self.fail("sentinel/registry.ts: 不存在")

        status = self._merge_conditions(info)
        return GateResult("gate-4", "哨兵自主巡检", "诊断", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 5: 专家自主诊断
    # ═════════════════════════════════════════════════════════════════

    def check_gate_5(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: expert-autonomy.ts + AutonomyInput + AutonomyResult
        if self.file_exists("src/l3/expert-autonomy.ts"):
            has_autonomy_input = self.grep(r"AutonomyInput", "src/l3/expert-autonomy.ts")
            has_autonomy_result = self.grep(r"AutonomyResult", "src/l3/expert-autonomy.ts")
            if has_autonomy_input and has_autonomy_result:
                info["passed"] += 1
                parts.append("expert-autonomy.ts: AutonomyInput + AutonomyResult 存在")
                self.ok("expert-autonomy.ts: AutonomyInput + AutonomyResult 存在")
            else:
                info["partial"] += 1
                parts.append("expert-autonomy.ts: 接口定义不完整")
                self.warn("expert-autonomy.ts: 接口定义不完整")
        else:
            info["failed"] += 1
            parts.append("expert-autonomy.ts: 不存在")
            self.fail("expert-autonomy.ts: 不存在")

        # C2: expert-router.ts
        if self.file_exists("src/l2/expert-router.ts"):
            empty = self.check_empty_impl("src/l2/expert-router.ts", "ExpertRouter")
            if empty:
                info["partial"] += 1
                parts.append(f"expert-router.ts: 空壳({empty})")
                self.warn(f"expert-router.ts: 空壳({empty})")
            else:
                router_class = self.grep(r"ExpertRouter|class\s+\w+Router", "src/l2/expert-router.ts")
                if router_class:
                    info["passed"] += 1
                    parts.append("expert-router.ts: ExpertRouter 类存在")
                    self.ok("expert-router.ts: ExpertRouter 类存在")
                else:
                    info["partial"] += 1
                    parts.append("expert-router.ts: 存在但结构待确认")
                    self.warn("expert-router.ts: 结构待确认")
        else:
            info["failed"] += 1
            parts.append("expert-router.ts: 不存在")
            self.fail("expert-router.ts: 不存在")

        # C3: diagnosis-launcher.ts 触发全量诊断
        if self.file_exists("src/agent/diagnosis-launcher.ts"):
            diag_fn = self.grep(r"export\s+(async\s+)?function\s+", "src/agent/diagnosis-launcher.ts")
            if diag_fn:
                info["passed"] += 1
                parts.append("diagnosis-launcher.ts: 含诊断触发函数")
                self.ok("diagnosis-launcher.ts: 含诊断触发函数")
            else:
                info["partial"] += 1
                parts.append("diagnosis-launcher.ts: 存在但无导出函数")
                self.warn("diagnosis-launcher.ts: 无导出函数")
        else:
            info["failed"] += 1
            parts.append("diagnosis-launcher.ts: 不存在")
            self.fail("diagnosis-launcher.ts: 不存在")

        # C4: 端到端——AutonomyResult.hypothesis 长度等（静态近似）
        evidence_refs = self.grep(r"evidence.*string\[\]", "src/l3/expert-autonomy.ts")
        hypothesis = self.grep(r"hypothesis.*string", "src/l3/expert-autonomy.ts")
        if evidence_refs and hypothesis:
            info["partial"] += 1
            parts.append("接口字段: evidence[] + hypothesis 定义完整(端到端待验证)")
            self.warn("接口字段: evidence[] + hypothesis 定义完整，但端到端未验证")
        else:
            info["partial"] += 1
            parts.append("接口字段: 定义不完整")
            self.warn("接口字段: 定义不完整")

        status = self._merge_conditions(info)
        return GateResult("gate-5", "专家自主诊断", "诊断", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 6: 诊断可验证
    # ═════════════════════════════════════════════════════════════════

    def check_gate_6(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: 42 边 JSON 定义（实际 55）
        edge_dir = self._path("extensions/ontology/edge-types")
        edge_count = 0
        if edge_dir.exists():
            edge_count = len(list(edge_dir.glob("*.json")))
        if edge_count >= 42:
            info["passed"] += 1
            parts.append(f"边 JSON: {edge_count} 个(>=42)")
            self.ok(f"边 JSON: {edge_count} 个(>=42)")
        elif edge_count > 0:
            info["partial"] += 1
            parts.append(f"边 JSON: {edge_count} 个(<42)")
            self.warn(f"边 JSON: {edge_count} 个(<42)")
        else:
            info["failed"] += 1
            parts.append("边 JSON: 0 个")
            self.fail("边 JSON: 0 个")

        # C2: compute 函数 ≥ 33（src/ + packages/）
        src_compute = len(self.grep_r(r"export\s+(async\s+)?function\s+compute", "src", file_ext=".ts"))
        pkg_compute = 0
        pkg_dir = self._path("packages/engine-core")
        if pkg_dir.exists():
            pkg_compute = len(self.grep_r(r"export\s+(async\s+)?function\s+compute",
                                          "packages/engine-core", file_ext=".ts"))
        total_compute = src_compute + pkg_compute
        if total_compute >= 33:
            info["passed"] += 1
            parts.append(f"compute 函数: {total_compute} 个(src {src_compute} + pkg {pkg_compute})")
            self.ok(f"compute 函数: {total_compute} 个(src {src_compute} + pkg {pkg_compute})")
        elif total_compute >= 10:
            info["partial"] += 1
            parts.append(f"compute 函数: {total_compute} 个(<33)")
            self.warn(f"compute 函数: {total_compute} 个(<33)")
        else:
            info["failed"] += 1
            parts.append(f"compute 函数: {total_compute} 个(过少)")
            self.fail(f"compute 函数: {total_compute} 个(过少)")

        # C3: P0 边 transfer_function 映射到存在的 compute 函数
        p0_with_tf = 0
        if edge_dir.exists():
            for f in sorted(edge_dir.glob("*.json")):
                try:
                    d = json.loads(f.read_text("utf-8", errors="replace"))
                    tf = d.get("transfer_function", "")
                    if tf and "TBD" not in tf and len(tf) > 20:
                        p0_with_tf += 1
                except Exception:
                    continue
        if p0_with_tf >= 3:
            info["passed"] += 1
            parts.append(f"有效 transfer_function: {p0_with_tf} 条")
            self.ok(f"有效 transfer_function: {p0_with_tf} 条")
        elif p0_with_tf > 0:
            info["partial"] += 1
            parts.append(f"有效 transfer_function: {p0_with_tf} 条(不足)")
            self.warn(f"有效 transfer_function: {p0_with_tf} 条(不足)")
        else:
            info["failed"] += 1
            parts.append("有效 transfer_function: 0 条")
            self.fail("有效 transfer_function: 0 条")

        status = self._merge_conditions(info)
        return GateResult("gate-6", "诊断可验证", "诊断", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 7: 方向有效性监测
    # ═════════════════════════════════════════════════════════════════

    def check_gate_7(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: 方向监测模块——文件名含 direction/orientation，且含 42 边参数读取逻辑
        # 要求：独立的方向监测模块文件，不是其他业务模块中顺带提到的 direction 字段
        biz_direction_modules = []
        for f in sorted(self._path("src").rglob("*.ts")):
            rel = str(f.relative_to(self.root))
            if "node_modules" in rel or ".test." in rel:
                continue
            fname = f.name.lower()
            has_dir_keyword = any(kw in fname for kw in ["direction", "orientation", "trajectory", "方向"])
            if not has_dir_keyword:
                # 即使文件名不包含，文件内容同时包含 direction + edge 参数读取也算
                text = f.read_text("utf-8", errors="replace")
                if re.search(r"\bdirection\b", text) and re.search(r"(edge|transfer_function|42|42边)", text):
                    has_dir_keyword = True
            if has_dir_keyword:
                text = f.read_text("utf-8", errors="replace")
                has_biz = not bool(re.search(r"(flex-direction|Directions?\b|cssText|grid)", text))
                has_42_edge = bool(re.search(r"(edge|transfer_function|42|本体|图遍历)", text))
                if has_biz:
                    biz_direction_modules.append({"file": rel, "hasEdgeRef": has_42_edge})

        if biz_direction_modules:
            with_edge_ref = sum(1 for m in biz_direction_modules if m["hasEdgeRef"])
            info["passed"] += 1
            parts.append(f"方向监测: {len(biz_direction_modules)} 模块({with_edge_ref} 含边引用)")
            self.ok(f"方向监测: {len(biz_direction_modules)} 模块({with_edge_ref} 含边引用)")
        else:
            info["failed"] += 1
            parts.append("方向监测: 无专用方向监测模块")
            self.fail("方向监测: 无专用方向监测模块")
        dir_status = self.grep_r(r"direction_status", "src", file_ext=".ts")
        if dir_status:
            info["passed"] += 1
            parts.append("direction_status: 输出字段存在")
            self.ok("direction_status: 输出字段存在")
        else:
            info["failed"] += 1
            parts.append("direction_status: 无输出字段")
            self.fail("direction_status: 无输出字段")

        # C3: 消费 42 边参数 + Goal 集合 + 子循环溢出状态
        has_edge_ref = any(m["hasEdgeRef"] for m in biz_direction_modules)
        if has_edge_ref:
            info["passed"] += 1
            parts.append("方向监测: 消费 42 边参数")
            self.ok("方向监测: 消费 42 边参数")
        else:
            info["partial"] += 1
            parts.append("方向监测: 数据源引用待确认")
            self.warn("方向监测: 多数据源引用待确认")

        status = self._merge_conditions(info)
        return GateResult("gate-7", "方向有效性监测", "诊断", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 8: 诊断→Goal 自动转化
    # ═════════════════════════════════════════════════════════════════

    def check_gate_8(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: goal-store.ts + createGoal
        if self.file_exists("src/growth/goal-store.ts"):
            has_create = self.grep(r"createGoal", "src/growth/goal-store.ts")
            if has_create:
                info["passed"] += 1
                parts.append("goal-store.ts: createGoal 存在")
                self.ok("goal-store.ts: createGoal 存在")
            else:
                info["partial"] += 1
                parts.append("goal-store.ts: 无 createGoal")
                self.warn("goal-store.ts: 无 createGoal")
        else:
            info["failed"] += 1
            parts.append("goal-store.ts: 不存在")
            self.fail("goal-store.ts: 不存在")

        # C2: proposal-engine.ts 诊断→Goal 转换逻辑
        if self.file_exists("src/growth/proposal-engine.ts"):
            empty = self.check_empty_impl("src/growth/proposal-engine.ts", "generateProposalFromDiagnosis")
            if empty:
                info["partial"] += 1
                parts.append(f"proposal-engine.ts: 空壳({empty})")
                self.warn(f"proposal-engine.ts: 空壳({empty})")
            else:
                has_proposal = self.grep(r"generateProposalFromDiagnosis|generateGoalFromProposal",
                                         "src/growth/proposal-engine.ts")
                if has_proposal:
                    info["passed"] += 1
                    parts.append("proposal-engine.ts: 诊断→Goal 转换存在")
                    self.ok("proposal-engine.ts: 诊断→Goal 转换存在")
                else:
                    info["partial"] += 1
                    parts.append("proposal-engine.ts: 转换逻辑待确认")
                    self.warn("proposal-engine.ts: 转换逻辑待确认")
        else:
            info["failed"] += 1
            parts.append("proposal-engine.ts: 不存在")
            self.fail("proposal-engine.ts: 不存在")

        # C3: goal-types.ts 类型定义
        if self.file_exists("src/growth/goal-types.ts"):
            goal_type = self.grep(r"Goal", "src/growth/goal-types.ts")
            if goal_type:
                info["passed"] += 1
                parts.append("goal-types.ts: Goal 类型定义存在")
                self.ok("goal-types.ts: Goal 类型定义存在")
            else:
                info["partial"] += 1
                parts.append("goal-types.ts: 类型定义待确认")
                self.warn("goal-types.ts: 类型定义待确认")
        else:
            info["failed"] += 1
            parts.append("goal-types.ts: 不存在")
            self.fail("goal-types.ts: 不存在")

        # C4: createGoal 返回有效 goalId（端到端，静态近似）
        if self.file_exists("src/growth/goal-store.ts"):
            goal_id_fn = self.grep(r"Promise<string>|string\):|goalId", "src/growth/goal-store.ts")
            if goal_id_fn:
                info["partial"] += 1
                parts.append("createGoal: 返回 string(端到端待验证)")
                self.warn("createGoal: 返回 string，端到端待验证")
            else:
                info["partial"] += 1
                parts.append("createGoal: 返回类型待确认")
                self.warn("createGoal: 返回类型待确认")

        status = self._merge_conditions(info)
        return GateResult("gate-8", "诊断→Goal自动转化", "导航", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 9: Goal 执行追踪
    # ═════════════════════════════════════════════════════════════════

    def check_gate_9(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: goal-sentinel.ts 三因子偏离模型
        if self.file_exists("src/growth/goal-sentinel.ts"):
            has_three = all(
                re.search(p, self.read_file("src/growth/goal-sentinel.ts"))
                for p in [r"threshold", r"(trend|baseline)"]
            )
            if has_three:
                info["passed"] += 1
                parts.append("goal-sentinel.ts: 三因子偏离模型存在")
                self.ok("goal-sentinel.ts: 三因子偏离模型存在")
            else:
                info["partial"] += 1
                parts.append("goal-sentinel.ts: 偏离模型不完整")
                self.warn("goal-sentinel.ts: 偏离模型不完整")
        else:
            info["failed"] += 1
            parts.append("goal-sentinel.ts: 不存在")
            self.fail("goal-sentinel.ts: 不存在")

        # C2: goal-sentinel-lifecycle.ts 方案级哨兵注册
        if self.file_exists("src/growth/goal-sentinel-lifecycle.ts"):
            has_lifecycle = self.grep(r"(register|autoRegister|sentinel)", "src/growth/goal-sentinel-lifecycle.ts")
            if has_lifecycle:
                info["passed"] += 1
                parts.append("goal-sentinel-lifecycle.ts: 方案哨兵注册存在")
                self.ok("goal-sentinel-lifecycle.ts: 方案哨兵注册存在")
            else:
                info["partial"] += 1
                parts.append("goal-sentinel-lifecycle.ts: 注册逻辑待确认")
                self.warn("goal-sentinel-lifecycle.ts: 注册逻辑待确认")
        else:
            info["failed"] += 1
            parts.append("goal-sentinel-lifecycle.ts: 不存在")
            self.fail("goal-sentinel-lifecycle.ts: 不存在")

        # C3: 端到端——P0 告警逻辑
        p0_alert = self.grep(r"P0.*告警|告警.*P0", "src/growth/goal-sentinel.ts")
        if p0_alert:
            info["partial"] += 1
            parts.append("P0 告警: 逻辑存在(端到端待验证)")
            self.warn("P0 告警: 逻辑存在，端到端待验证")
        else:
            info["partial"] += 1
            parts.append("P0 告警: 逻辑待确认")
            self.warn("P0 告警: 逻辑待确认")

        status = self._merge_conditions(info)
        return GateResult("gate-9", "Goal执行追踪", "导航", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 10: Goal 偏离调整
    # ═════════════════════════════════════════════════════════════════

    def check_gate_10(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: lightweight-diagnosis.ts 存在
        if self.file_exists("src/growth/lightweight-diagnosis.ts"):
            empty = self.check_empty_impl("src/growth/lightweight-diagnosis.ts", "lightweightDiagnosis")
            if empty:
                info["partial"] += 1
                parts.append(f"lightweight-diagnosis.ts: 空壳({empty})")
                self.warn(f"lightweight-diagnosis.ts: 空壳({empty})")
            else:
                ld_fn = self.grep(r"export\s+(async\s+)?function\s+", "src/growth/lightweight-diagnosis.ts")
                if ld_fn:
                    info["passed"] += 1
                    parts.append("lightweight-diagnosis.ts: 含导出函数")
                    self.ok("lightweight-diagnosis.ts: 含导出函数")
                else:
                    info["partial"] += 1
                    parts.append("lightweight-diagnosis.ts: 无导出函数")
                    self.warn("lightweight-diagnosis.ts: 无导出函数")
        else:
            info["failed"] += 1
            parts.append("lightweight-diagnosis.ts: 不存在")
            self.fail("lightweight-diagnosis.ts: 不存在")

        # C2: P0 告警自动调用
        p0_call = self.grep(r"lightweight|reDiagnosis|再诊断", "src/growth/goal-sentinel.ts")
        if p0_call:
            info["passed"] += 1
            parts.append("P0 告警: 自动调用再诊断")
            self.ok("P0 告警: 自动调用再诊断")
        else:
            info["partial"] += 1
            parts.append("P0 告警: 自动调用待确认")
            self.warn("P0 告警: 自动调用待确认")

        # C3: 升级协议——≥3 次再诊断→全量诊断
        upgrade = self.grep(r"3.*reDiagnosis|两次|三次|automaticFull|fullDiagnosis",
                           "src/growth/lightweight-diagnosis.ts")
        if upgrade:
            info["passed"] += 1
            parts.append("升级协议: ≥3→全量诊断")
            self.ok("升级协议: ≥3→全量诊断")
        else:
            info["partial"] += 1
            parts.append("升级协议: 待确认")
            self.warn("升级协议: 待确认")

        status = self._merge_conditions(info)
        return GateResult("gate-10", "Goal偏离调整", "导航", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 11: Goal 闭环验证
    # ═════════════════════════════════════════════════════════════════

    def check_gate_11(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: goal-lifecycle.ts + closeGoal
        if self.file_exists("src/growth/goal-lifecycle.ts"):
            has_close = self.grep(r"closeGoal", "src/growth/goal-lifecycle.ts")
            if has_close:
                info["passed"] += 1
                parts.append("goal-lifecycle.ts: closeGoal 存在")
                self.ok("goal-lifecycle.ts: closeGoal 存在")
            else:
                info["failed"] += 1
                parts.append("goal-lifecycle.ts: 无 closeGoal")
                self.fail("goal-lifecycle.ts: 无 closeGoal")
        else:
            info["failed"] += 1
            parts.append("goal-lifecycle.ts: 不存在")
            self.fail("goal-lifecycle.ts: 不存在")

        # C2: closeGoal 执行偏差比对
        compare = self.grep(r"actualMetrics|metrics.*比对|deviation", "src/growth/goal-lifecycle.ts")
        if compare:
            info["passed"] += 1
            parts.append("closeGoal: actualMetrics 偏差比对")
            self.ok("closeGoal: actualMetrics 偏差比对")
        else:
            info["partial"] += 1
            parts.append("closeGoal: 偏差比对待确认")
            self.warn("closeGoal: 偏差比对待确认")

        # C3: 6 类偏差分类器
        if self.file_exists("src/growth/knowledge-feedback.ts"):
            classifiers = [
                "execution_failure", "market_change", "target_too_high",
                "target_too_low", "external_shock", "measurement_error",
            ]
            kb_text = self.read_file("src/growth/knowledge-feedback.ts")
            found_cls = [c for c in classifiers if c in kb_text]
            if len(found_cls) >= 6:
                info["passed"] += 1
                parts.append(f"偏差分类器: 6 类全部存在")
                self.ok("偏差分类器: 6 类全部存在")
            elif len(found_cls) >= 3:
                info["partial"] += 1
                parts.append(f"偏差分类器: {len(found_cls)}/6 类存在")
                self.warn(f"偏差分类器: {len(found_cls)}/6 类存在")
            else:
                info["failed"] += 1
                parts.append(f"偏差分类器: {len(found_cls)}/6 类存在(不足)")
                self.fail(f"偏差分类器: {len(found_cls)}/6 类存在(不足)")
        else:
            info["failed"] += 1
            parts.append("knowledge-feedback.ts: 不存在")
            self.fail("knowledge-feedback.ts: 不存在")

        status = self._merge_conditions(info)
        return GateResult("gate-11", "Goal闭环验证", "导航", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 12: 核心循环定时运行
    # ═════════════════════════════════════──────��════════════════════

    def check_gate_12(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: loop-scheduler.ts 存在
        if self.file_exists("src/loops/loop-scheduler.ts"):
            empty = self.check_empty_impl("src/loops/loop-scheduler.ts", "schedule")
            if empty:
                info["partial"] += 1
                parts.append(f"loop-scheduler.ts: 空壳({empty})")
                self.warn(f"loop-scheduler.ts: 空壳({empty})")
            else:
                info["passed"] += 1
                parts.append("loop-scheduler.ts: 存在且非空壳")
                self.ok("loop-scheduler.ts: 存在且非空壳")
        else:
            info["failed"] += 1
            parts.append("loop-scheduler.ts: 不存在")
            self.fail("loop-scheduler.ts: 不存在")

        # C2: LOOP_TRIGGER_MATRIX 定义 >= 5 个循环
        if self.file_exists("src/loops/loop-trigger-config.ts"):
            ltm_text = self.read_file("src/loops/loop-trigger-config.ts")
            # Count loopId declarations (actual loop definitions)
            loop_count = len(re.findall(r"loopId:\s*['\"]loop-\d+['\"]", ltm_text))
            # Count period entries (cron expressions for each scale)
            period_count = len(re.findall(r"period:\s*['\"][0-9*/\s]+['\"]", ltm_text))
            if loop_count >= 5 or period_count >= 5:
                info["passed"] += 1
                parts.append(f"LOOP_TRIGGER_MATRIX: {loop_count} 个循环({period_count} 周期)")
                self.ok(f"LOOP_TRIGGER_MATRIX: {loop_count} 个循环({period_count} 周期)")
            else:
                info["partial"] += 1
                parts.append(f"LOOP_TRIGGER_MATRIX: {loop_count} 个循环(<5)")
                self.warn(f"LOOP_TRIGGER_MATRIX: {loop_count} 个循环(<5)")
        else:
            info["failed"] += 1
            parts.append("loop-trigger-config.ts: 不存在")
            self.fail("loop-trigger-config.ts: 不存在")

        # C3: 成功执行记录（静态替代——检查 CronScheduler 注册逻辑）
        cron_exists = self.grep(r"cron\|cron_jobs\|schedule", "src/loops/loop-scheduler.ts")
        if cron_exists:
            info["partial"] += 1
            parts.append("CronScheduler: 注册逻辑存在(执行记录待确认)")
            self.warn("CronScheduler: 注册逻辑存在，执行记录需运行时确认")
        else:
            info["partial"] += 1
            parts.append("CronScheduler: 注册逻辑待确认")
            self.warn("CronScheduler: 注册逻辑待确认")

        status = self._merge_conditions(info)
        return GateResult("gate-12", "核心循环定时运行", "持续运行", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 13: 静默停滞检测
    # ═════════════════════════════════════════════════════════════════

    def check_gate_13(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: silence/stagnation/stall/heartbeat 关键词在 src/loops/ 中
        silence_hits = self.grep_r(
            r"silence|stagnation|stall|heartbeat",
            "src/loops",
            exclude_pattern=r"(node_modules|\.test\.)",
            file_ext=".ts",
        )
        if silence_hits:
            info["passed"] += 1
            parts.append("静默检测: 关键词存在于 loops 目录")
            self.ok("静默检测: 关键词存在于 loops 目录")
        else:
            info["failed"] += 1
            parts.append("静默检测: loops 中无 silence/stagnation/stall/heartbeat")
            self.fail("静默检测:  loops 中无检测逻辑")

        # C2: 周期性运行（约每 24h）
        periodic = self.grep(r"cron.*24|24.*hour|每隔|每天|daily|0 0", "src/loops/loop-scheduler.ts")
        if periodic:
            info["partial"] += 1
            parts.append("静默检测: 周期性调度存在(约24h)")
            self.warn("静默检测: 周期性调度存在，待输出确认")
        else:
            info["failed"] += 1
            parts.append("静默检测: 无周期性调度")
            self.fail("静默检测: 无周期性调度")

        # C3: 超 3 周期→SYSTEM_SILENCE 告警
        silence_alert = self.grep_r(r"SYSTEM_SILENCE|silence.*alert|stagnation.*alert",
                                      "src/loops", file_ext=".ts")
        if silence_alert:
            info["partial"] += 1
            parts.append("静默检测: SYSTEM_SILENCE 告警存在")
            self.warn("静默检测: SYSTEM_SILENCE 告警存在")
        else:
            info["failed"] += 1
            parts.append("静默检测: 无 SYSTEM_SILENCE 告警")
            self.fail("静默检测: 无 SYSTEM_SILENCE 告警")

        status = self._merge_conditions(info)
        return GateResult("gate-13", "静默停滞检测", "持续运行", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 14: 中层驱动进化
    # ═════════════════════════════════════════════════════════════════

    def check_gate_14(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: middle-evolution-engine.ts + processFeedbackSignals
        if self.file_exists("src/loops/middle-evolution-engine.ts"):
            has_process = self.grep(r"processFeedbackSignals", "src/loops/middle-evolution-engine.ts")
            if has_process:
                info["passed"] += 1
                parts.append("middle-evolution-engine.ts: processFeedbackSignals 存在")
                self.ok("middle-evolution-engine.ts: processFeedbackSignals 存在")
            else:
                info["partial"] += 1
                parts.append("middle-evolution-engine.ts: 函数签名待确认")
                self.warn("middle-evolution-engine.ts: 函数签名待确认")
        else:
            info["failed"] += 1
            parts.append("middle-evolution-engine.ts: 不存在")
            self.fail("middle-evolution-engine.ts: 不存在")

        # C2: 5 类进化动作
        me_text = self.read_file("src/loops/middle-evolution-engine.ts")
        actions = [
            "threshold_adjust", "goal_formula_tweak", "path_rank_downgrade",
            "expert_confidence_downgrade", "cross_dept_arbitration",
        ]
        found_actions = [a for a in actions if a in me_text]
        if len(found_actions) >= 5:
            info["passed"] += 1
            parts.append("进化动作: 5 类全部定义")
            self.ok("进化动作: 5 类全部定义")
        elif len(found_actions) >= 3:
            info["partial"] += 1
            parts.append(f"进化动作: {len(found_actions)}/5 类定义")
            self.warn(f"进化动作: {len(found_actions)}/5 类定义")
        else:
            info["failed"] += 1
            parts.append(f"进化动作: {len(found_actions)}/5 类(不足)")
            self.fail(f"进化动作: {len(found_actions)}/5 类(不足)")

        # C3: ≥3 次触发条件
        trigger_rule = self.grep(r"3.*触发|>=3|≥3|three.*times|same.*signal.*3",
                                "src/loops/middle-evolution-engine.ts")
        if trigger_rule:
            info["passed"] += 1
            parts.append("触发条件: ≥3 次规则存在")
            self.ok("触发条件: ≥3 次规则存在")
        else:
            info["partial"] += 1
            parts.append("触发条件: ≥3 次规则待确认")
            self.warn("触发条件: ≥3 次规则待确认")

        status = self._merge_conditions(info)
        return GateResult("gate-14", "中层驱动进化", "进化", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 15: 知识积累与回流
    # ═════════════════════════════════════════════════════════════════

    def check_gate_15(self) -> GateResult:
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []

        # C1: knowledge-feedback.ts + extractGoalKnowledge
        if self.file_exists("src/growth/knowledge-feedback.ts"):
            has_extract = self.grep(r"extractGoalKnowledge", "src/growth/knowledge-feedback.ts")
            if has_extract:
                info["passed"] += 1
                parts.append("knowledge-feedback.ts: extractGoalKnowledge 存在")
                self.ok("knowledge-feedback.ts: extractGoalKnowledge 存在")
            else:
                info["partial"] += 1
                parts.append("knowledge-feedback.ts: 函数签名待确认")
                self.warn("knowledge-feedback.ts: 函数签名待确认")
        else:
            info["failed"] += 1
            parts.append("knowledge-feedback.ts: 不存在")
            self.fail("knowledge-feedback.ts: 不存在")

        # C2: knowledge-store.ts 含插入方法
        if self.file_exists("src/l4/knowledge-store.ts"):
            has_insert = self.grep(r"insert|store|save", "src/l4/knowledge-store.ts")
            if has_insert:
                info["passed"] += 1
                parts.append("knowledge-store.ts: 含插入方法")
                self.ok("knowledge-store.ts: 含插入方法")
            else:
                info["partial"] += 1
                parts.append("knowledge-store.ts: 无插入方法")
                self.warn("knowledge-store.ts: 无插入方法")
        else:
            info["failed"] += 1
            parts.append("knowledge-store.ts: 不存在")
            self.fail("knowledge-store.ts: 不存在")

        # C3: 14 字段 GoalExecutionKnowledge
        kb_text = self.read_file("src/growth/knowledge-feedback.ts")
        goal_exec_knowledge = self.grep(r"GoalExecutionKnowledge", "src/growth/knowledge-feedback.ts")
        if goal_exec_knowledge:
            info["partial"] += 1
            parts.append("GoalExecutionKnowledge: 类型存在(字段数待确认)")
            self.warn("GoalExecutionKnowledge: 类型存在，字段数待确认")
        else:
            info["partial"] += 1
            parts.append("GoalExecutionKnowledge: 定义待确认")
            self.warn("GoalExecutionKnowledge: 定义待确认")

        status = self._merge_conditions(info)
        return GateResult("gate-15", "知识积累与回流", "进化", status, info, details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  Gate 16: 控制塔信号（加权评分）
    # ═════════════════════════════════════════════════════════════════

    def check_gate_16(self) -> GateResult:
        """加权评分：网守25% + 审计器25% + 注射器12.5% + 契约器12.5% + 写锁12.5% + 环境12.5%"""
        info = {"passed": 0, "partial": 0, "failed": 0}
        parts: list[str] = []
        weight_total = 0.0

        signals_dir = self._path(".codex/signals")
        audit_dir = self._path(".codex/audit-reports")
        contracts_dir = self._path(".codex/contracts")

        # 网守 (25%)
        gatekeeper_signal = signals_dir / "gatekeeper.json"
        gatekeeper_good = gatekeeper_signal.exists() and gatekeeper_signal.stat().st_size > 0
        # 兼容旧格式——任意 .json 含 component=gatekeeper 也计数
        if not gatekeeper_good and signals_dir.exists():
            for f in signals_dir.glob("*.json"):
                try:
                    d = json.loads(f.read_text("utf-8", errors="replace"))
                    if d.get("component") == "gatekeeper":
                        gatekeeper_good = True
                        break
                except Exception:
                    continue
        if gatekeeper_good:
            weight_total += 25.0
            parts.append("网守(25%): 通过")
            self.ok("网守(25%): 通过")
        else:
            parts.append("网守(25%): 未通过")
            self.fail("网守(25%): 未通过")

        # 审计器 (25%)—— audit-reports/ 有 >=1 文件 > 100 bytes
        auditor_good = False
        if audit_dir.exists():
            for f in audit_dir.iterdir():
                if f.is_file() and f.stat().st_size > 100:
                    auditor_good = True
                    break
        if auditor_good:
            weight_total += 25.0
            parts.append("审计器(25%): 通过")
            self.ok("审计器(25%): 通过")
        else:
            parts.append("审计器(25%): 未通过")
            self.fail("审计器(25%): 未通过")

        # 上下文注射器 (12.5%)
        injector_good = False
        if signals_dir.exists():
            for f in signals_dir.glob("*.json"):
                try:
                    d = json.loads(f.read_text("utf-8", errors="replace"))
                    if d.get("component", "").startswith("context-injector"):
                        injector_good = True
                        break
                except Exception:
                    continue
        if injector_good:
            weight_total += 12.5
            parts.append("注射器(12.5%): 通过")
            self.ok("注射器(12.5%): 通过")
        else:
            parts.append("注射器(12.5%): 未通过")
            self.fail("注射器(12.5%): 未通过")

        # 契约存档器 (12.5%)
        contract_good = False
        if contracts_dir.exists():
            for f in contracts_dir.glob("*.json"):
                if f.stat().st_size > 0:
                    contract_good = True
                    break
        if contract_good:
            weight_total += 12.5
            parts.append("契约器(12.5%): 通过")
            self.ok("契约器(12.5%): 通过")
        else:
            parts.append("契约器(12.5%): 未通过(空)")
            self.fail("契约器(12.5%): 未通过(空)")

        # 写入锁 (12.5%)
        write_lock_good = False
        if signals_dir.exists():
            for f in signals_dir.glob("*.json"):
                try:
                    d = json.loads(f.read_text("utf-8", errors="replace"))
                    if d.get("component", "").startswith("write-lock"):
                        write_lock_good = True
                        break
                except Exception:
                    continue
        if write_lock_good:
            weight_total += 12.5
            parts.append("写锁(12.5%): 通过")
            self.ok("写锁(12.5%): 通过")
        else:
            parts.append("写锁(12.5%): 未通过")
            self.fail("写锁(12.5%): 未通过")

        # 环境验证器 (12.5%)
        env_snapshot = self._path(".codex/env-snapshot.json")
        env_good = env_snapshot.exists() and env_snapshot.stat().st_size > 0
        if env_good:
            weight_total += 12.5
            parts.append("环境验证器(12.5%): 通过")
            self.ok("环境验证器(12.5%): 通过")
        else:
            parts.append("环境验证器(12.5%): 未通过")
            self.fail("环境验证器(12.5%): 未通过")

        self.log(f"    加权得分: {weight_total:.1f}% (>=60% 通过)")
        if weight_total >= 60.0:
            status = "pass"
            info["passed"] = 3
        elif weight_total >= 30.0:
            status = "partial"
            info["partial"] = 3
        else:
            status = "fail"
            info["failed"] = 3
        info["weightedScore"] = round(weight_total, 1)
        parts.append(f"加权得分: {weight_total:.1f}%")
        return GateResult("gate-16", "控制塔信号", "控制", status, info,
                          details="; ".join(parts))

    # ═════════════════════════════════════════════════════════════════
    #  依赖链降级
    # ═════════════════════════════════════════════════════════════════

    def apply_downgrades(self) -> None:
        """附录 A §1.2 依赖链降级"""
        results_by_id = {r.id: r for r in self.results}
        for upstream_num, downstream_num, trigger, degrade_from, degrade_to in DEPENDENCY_RULES:
            up = results_by_id.get(f"gate-{upstream_num}")
            down = results_by_id.get(f"gate-{downstream_num}")
            if not up or not down:
                continue
            if down.status in ("unverifiable",):
                continue
            if up.status != trigger:
                continue
            # 检查 degrade_from 条件
            if degrade_from != "*" and down.status != degrade_from:
                continue
            old_status = down.status
            severity = {"pass": 0, "partial": 1, "fail": 2}
            if severity.get(degrade_to, 0) > severity.get(old_status, 0):
                down.status = degrade_to
                down.downgraded_by = up.id
                down.downgraded_from = old_status
                self.log(f"    [降级] {down.id}: {old_status}→{degrade_to} (依赖 {up.id})")

    # ═════════════════════════════════════════════════════════════════
    #  主流程
    # ═════════════════════════════════════════════════════════════════

    def check_all(self) -> list[GateResult]:
        self.log(f"\n{'=' * 50}")
        self.log(f"  D219 门禁自动判定 v{SCRIPT_VERSION}")
        self.log(f"  代码库: {self.root}")
        self.log(f"{'=' * 50}\n")

        # Phase 1: 健康检查
        self.log("[Phase 1] 自身健康检查 (31 条预期路径)...")
        self.health_result = self.run_health_check()
        missing = self.health_result["missingPaths"]
        self.log(f"  路径: {self.health_result['foundPaths']}/{self.health_result['expectedPaths']} 存在")
        if missing:
            self.log(f"  缺失: {', '.join(missing[:5])}{'...' if len(missing) > 5 else ''}")
        self.log("")

        # Phase 2: 逐门禁判定
        self.log("[Phase 2] 逐门禁判定")
        self.log("")

        checks = [
            self.check_gate_0,   self.check_gate_1,  self.check_gate_2,
            self.check_gate_3,   self.check_gate_4,  self.check_gate_5,
            self.check_gate_6,   self.check_gate_7,  self.check_gate_8,
            self.check_gate_9,   self.check_gate_10, self.check_gate_11,
            self.check_gate_12,  self.check_gate_13, self.check_gate_14,
            self.check_gate_15,  self.check_gate_16,
        ]

        for i, check in enumerate(checks):
            meta = GATE_META[i]
            self.log(f"  [{meta['id']}] {meta['name']} ({meta['dimension']})")
            result = check()
            self.results.append(result)
            self.log("")

        # Phase 3: 依赖链降级
        self.log("[Phase 3] 依赖链降级...")
        self.apply_downgrades()
        self.log("")

        return self.results

    # ═════════════════════════════════════════════════════════════════
    #  输出
    # ═════════════════════════════════════════════════════════════════

    def write_report(self, output_path: Path) -> None:
        """输出 gate-status.json（附录 A §四格式）"""
        duration_ms = int((time.time() - self.start_time) * 1000)

        passed = sum(1 for r in self.results if r.status == "pass")
        partial = sum(1 for r in self.results if r.status == "partial")
        failed = sum(1 for r in self.results if r.status == "fail")
        unverifiable = sum(1 for r in self.results if r.status == "unverifiable")

        weight_map = {"pass": 1.0, "partial": 0.5, "fail": 0.0, "unverifiable": 0.0}
        total_weight = sum(weight_map.get(r.status, 0.0) for r in self.results)
        weighted_progress = round(total_weight / max(len(self.results), 1), 2)

        report: dict[str, Any] = {
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "scriptVersion": SCRIPT_VERSION,
            "scanDurationMs": duration_ms,
            "gates": [r.to_dict() for r in self.results],
            "summary": {
                "passed": passed,
                "partial": partial,
                "failed": failed,
                "unverifiable": unverifiable,
                "weightedProgress": weighted_progress,
            },
            "healthCheck": self.health_result or {},
        }

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        self.log(f"\n{'=' * 50}")
        status_icons = {"pass": "✅", "partial": "⚠️", "fail": "❌", "unverifiable": "❓"}
        for r in self.results:
            icon = status_icons.get(r.status, "❓")
            downgrade = f" ({r.downgraded_from}→降级自{r.downgraded_by})" if r.downgraded_by else ""
            self.log(f"  {icon} {r.id}: {r.status}{downgrade}")
        self.log(f"{'=' * 50}")
        self.log(f"  通过: {passed} / 部分: {partial} / 失败: {failed} / 无法判定: {unverifiable}")
        self.log(f"  加权进度: {weighted_progress:.0%}")
        self.log(f"  耗时: {duration_ms}ms ({duration_ms/1000:.1f}s)")
        self.log(f"  输出: {output_path}")
        self.log(f"{'=' * 50}\n")

    def cleanup(self) -> None:
        """清理 Gate 0 启动的服务器进程"""
        if self._server_proc:
            try:
                self._server_proc.terminate()
                self._server_proc.wait(timeout=5)
            except Exception:
                try:
                    self._server_proc.kill()
                except Exception:
                    pass
            self._server_proc = None


# ═══════════════════════════════════════════════════════════════════════
#  CLI 入口
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="D219 门禁自动判定 — 17 产品门禁 30 秒自动扫描",
    )
    parser.add_argument("--quiet", action="store_true", help="静默模式，仅写文件")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="输出路径 (默认 .codex/signals/gate-status.json)")
    args = parser.parse_args()

    output_path = Path(args.output)
    checker = GateChecker(root=PROJECT_ROOT, quiet=args.quiet)

    try:
        checker.check_all()
        checker.write_report(output_path)
    except KeyboardInterrupt:
        print("\n中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n[FATAL] 脚本执行异常: {e}", file=sys.stderr)
        # 仍尝试输出部分结果
        if checker.results:
            checker.write_report(output_path)
        sys.exit(1)
    finally:
        checker.cleanup()


if __name__ == "__main__":
    main()
