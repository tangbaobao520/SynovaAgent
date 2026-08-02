#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/session-registry.py — D311 会话注册表 (M1 多会话协调底座)

控制塔 V4.6.0 M1: 多会话共享工作区的协调底座。登记每个活跃 session 的
身份/brief/pid/阶段/写集，供 staging-guard（暂存区隔离）、wait-manager
（并行等待管理）、pre-push（中间态保护）查询。

设计原则（设计文档 §2.0/§2.1.5）:
  - fail-open: 自身异常 → 空结果 + degraded-events.log + exit 0，绝不静默
  - 损坏自愈: registry JSON 损坏 → 备份 .corrupt-<ts> 后重建空注册表
  - 原子写: 临时文件 + os.replace（对齐 emit-signal.py）
  - 并发安全: 写操作前用 write_lock.py 锁 registry 自身（D209 复用）
  - session_id = brief 文件名去 .md（与 D296 认领制天然一致）

用法:
  session-registry.py register --session-id <id> --brief <path> [--pid <pid>]
  session-registry.py write-set --session-id <id> --add <file>... [--status <file> <dirty|staged|committed>]...
  session-registry.py claimants <file> [--active-only]
  session-registry.py attribution <file>...
  session-registry.py phase --session-id <id> --phase <CP1|CP2|CP3|CP4|DONE>
  session-registry.py gc [--max-age <sec>] [--stale-pid]
  session-registry.py list [--active]
  session-registry.py archive --session-id <id>

输出: UTF-8 JSON（sys.stdout.reconfigure）
"""
import argparse
import json
import os
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))

try:
    from write_lock import WriteLock
except ImportError:  # pragma: no cover - 降级: 锁不可用则直接写
    WriteLock = None

VALID_PHASES = ("CP1", "CP2", "CP3", "CP4", "DONE")
VALID_STATUSES = ("dirty", "staged", "committed")
DEFAULT_REGISTRY = REPO_ROOT / ".codex" / "control-tower" / "session-registry.json"
DEFAULT_LOCK_DIR = REPO_ROOT / ".codex" / "control-tower" / "locks"
DEFAULT_DEGRADED_LOG = REPO_ROOT / ".codex" / "control-tower" / "logs" / "degraded-events.log"


def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def log_degraded(log_path: Path, component: str, reason: str) -> None:
    """fail-open 降级记录（绝不静默）。"""
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {"time": _utcnow(), "component": component, "reason": reason},
                    ensure_ascii=False,
                )
                + "\n"
            )
    except OSError:
        pass  # 日志不可写 → 静默是最后兜底（源头哲学：日志不可写 → 告警不阻断）


class SessionRegistry:
    """会话注册表读写/查询/GC。线程安全 + 进程安全。

    双层互斥:
      - _thread_lock (进程内): write_lock.py 的 acquire 有 TOCTOU 竞态（D209 既有
        行为，不改），同进程多线程需串行化读-改-写
      - write_lock.py (进程间): 多 session 进程互斥
    """

    _thread_lock = threading.Lock()

    def __init__(
        self,
        registry_path: Path = DEFAULT_REGISTRY,
        lock_dir: Path = DEFAULT_LOCK_DIR,
        degraded_log: Path = DEFAULT_DEGRADED_LOG,
    ):
        self.registry_path = Path(registry_path)
        self.lock_dir = Path(lock_dir)
        self.degraded_log = Path(degraded_log)
        self._lock = WriteLock(lock_dir=str(self.lock_dir)) if WriteLock else None

    # ── 内部读写 ──

    def _acquire_lock(self) -> None:
        SessionRegistry._thread_lock.acquire()
        if self._lock is None:
            return
        try:
            self._lock.acquire(str(self.registry_path), owner="session-registry")
        except Exception as exc:  # fail-open
            log_degraded(self.degraded_log, "session-registry", f"lock fail: {exc}")

    def _release_lock(self) -> None:
        if self._lock is not None:
            try:
                self._lock.release(str(self.registry_path))
            except Exception as exc:  # fail-open
                log_degraded(self.degraded_log, "session-registry", f"unlock fail: {exc}")
        SessionRegistry._thread_lock.release()

    def _read(self) -> dict:
        """读取 registry；损坏 → 备份重建空注册表（自愈）。"""
        if not self.registry_path.exists():
            return {"version": 1, "updated_at": _utcnow(), "sessions": [], "archived": []}
        try:
            return json.loads(self.registry_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            # 损坏自愈: 备份后重建并写回盘（避免永久失效）
            try:
                self.registry_path.rename(
                    self.registry_path.with_suffix(f".json.corrupt-{_utcnow().replace(':', '')}")
                )
            except OSError:
                pass
            log_degraded(
                self.degraded_log, "session-registry", f"corrupt registry rebuilt: {exc}"
            )
            fresh = {"version": 1, "updated_at": _utcnow(), "sessions": [], "archived": []}
            try:
                self._write(fresh)
            except OSError:
                pass
            return fresh

    def _write(self, data: dict) -> None:
        """原子写（临时文件 + os.replace）。"""
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        data["updated_at"] = _utcnow()
        tmp = self.registry_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.registry_path)

    def _mutate(self, fn):
        """加锁读-改-写。"""
        self._acquire_lock()
        try:
            data = self._read()
            result = fn(data)
            self._write(data)
            return result
        finally:
            self._release_lock()

    # ── 查询 ──

    def list(self, active_only: bool = False) -> list:
        data = self._read()
        sessions = data.get("sessions", [])
        return sessions  # sessions 数组只含活跃；archived 独立存放

    def get(self, session_id: str) -> Optional[dict]:
        for s in self._read().get("sessions", []):
            if s["session_id"] == session_id:
                return s
        return None

    def claimants(self, file_path: str, active_only: bool = False) -> list:
        """返回认领该文件的 session_id 列表（忽略 committed 条目）。"""
        file_norm = file_path.replace("\\", "/").lower()
        result = []
        for s in self._read().get("sessions", []):
            for w in s.get("write_set", []):
                if w.get("status") == "committed":
                    continue
                if w["file"].replace("\\", "/").lower() == file_norm:
                    result.append(s["session_id"])
                    break
        return result

    def attribution(self, files: list) -> list:
        """每个文件 → {file, owner}（owner 为 None 表示无归属）。"""
        out = []
        for f in files:
            claimants = self.claimants(f, active_only=True)
            owner = claimants[0] if claimants else None
            out.append({"file": f, "owner": owner})
        return out

    # ── 变更 ──

    def register(self, session_id: str, brief: str, pid: Optional[int] = None) -> dict:
        """创建/刷新 session 条目（刷新 last_seen）。"""

        def fn(data):
            now = _utcnow()
            for s in data["sessions"]:
                if s["session_id"] == session_id:
                    s["last_seen_at"] = now
                    if pid is not None:
                        s["pid"] = pid
                    return {"created": False}
            data["sessions"].append(
                {
                    "session_id": session_id,
                    "brief": brief,
                    "pid": pid,
                    "started_at": now,
                    "last_seen_at": now,
                    "phase": "CP1",
                    "phase_entered_at": now,
                    "write_set": [],
                }
            )
            return {"created": True}

        return self._mutate(fn)

    def phase(self, session_id: str, phase: str) -> dict:
        if phase not in VALID_PHASES:
            raise ValueError(f"非法阶段: {phase} (合法: {VALID_PHASES})")

        def fn(data):
            for s in data["sessions"]:
                if s["session_id"] == session_id:
                    now = _utcnow()
                    s["phase"] = phase
                    s["phase_entered_at"] = now
                    s["last_seen_at"] = now
                    if phase != "CP1" and phase != s.get("phase"):
                        pass  # 回退允许（wait-manager 提示）
                    return {"updated": True}
            return {"updated": False}

        return self._mutate(fn)

    def write_set(
        self,
        session_id: str,
        add: Optional[list] = None,
        status: Optional[list] = None,
    ) -> dict:
        """add: [files] 加入写集 (dirty)；status: [(file, status)] 状态流转。"""

        def fn(data):
            now = _utcnow()
            for s in data["sessions"]:
                if s["session_id"] != session_id:
                    continue
                s["last_seen_at"] = now
                existing = {w["file"]: w for w in s["write_set"]}
                for f in add or []:
                    if f not in existing:
                        s["write_set"].append(
                            {"file": f, "claimed_at": now, "status": "dirty"}
                        )
                for f, st in status or []:
                    if st not in VALID_STATUSES:
                        raise ValueError(f"非法状态: {st}")
                    if f in existing:
                        existing[f]["status"] = st
                return {"updated": True}
            return {"updated": False}

        return self._mutate(fn)

    def archive(self, session_id: str) -> dict:
        """移入独立 archived 数组（保留审计，不硬删）。"""

        def fn(data):
            for i, s in enumerate(data["sessions"]):
                if s["session_id"] == session_id:
                    s["last_seen_at"] = _utcnow()
                    data["archived"].append(s)
                    del data["sessions"][i]
                    return {"archived": True}
            return {"archived": False}

        return self._mutate(fn)

    def gc(self, max_age_sec: int = 14400, stale_pid: bool = True) -> list:
        """孤儿清理: 超龄或 pid 已死 → 移入 archived。"""

        def fn(data):
            now = datetime.now(timezone.utc)
            archived_now = []
            keep = []
            for s in data["sessions"]:
                stale = False
                if stale_pid and s.get("pid"):
                    stale = not _pid_alive(s["pid"])
                if not stale:
                    try:
                        last = datetime.fromisoformat(s["last_seen_at"])
                        if last.tzinfo is None:
                            last = last.replace(tzinfo=timezone.utc)
                        if (now - last).total_seconds() > max_age_sec:
                            stale = True
                    except (ValueError, TypeError):
                        stale = True
                if stale:
                    data["archived"].append(s)
                    archived_now.append(s["session_id"])
                else:
                    keep.append(s)
            data["sessions"] = keep
            return archived_now

        return self._mutate(fn)

    # 测试辅助
    def _set_last_seen(self, session_id: str, ts: str) -> None:
        def fn(data):
            for s in data["sessions"]:
                if s["session_id"] == session_id:
                    s["last_seen_at"] = ts
                    return True
            return False

        self._mutate(fn)


def _pid_alive(pid: int) -> bool:
    """Windows/Linux 通用 pid 存活检测。"""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, PermissionError):
        return False


def _out(obj) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    print(json.dumps(obj, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description="D311 会话注册表")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_reg = sub.add_parser("register")
    p_reg.add_argument("--session-id", required=True)
    p_reg.add_argument("--brief", required=True)
    p_reg.add_argument("--pid", type=int, default=None)

    p_ws = sub.add_parser("write-set")
    p_ws.add_argument("--session-id", required=True)
    p_ws.add_argument("--add", nargs="*", default=[])
    p_ws.add_argument("--status", nargs="*", default=[])

    p_claim = sub.add_parser("claimants")
    p_claim.add_argument("file")
    p_claim.add_argument("--active-only", action="store_true")

    p_attr = sub.add_parser("attribution")
    p_attr.add_argument("files", nargs="+")

    p_ph = sub.add_parser("phase")
    p_ph.add_argument("--session-id", required=True)
    p_ph.add_argument("--phase", required=True)

    p_gc = sub.add_parser("gc")
    p_gc.add_argument("--max-age", type=int, default=14400)
    p_gc.add_argument("--stale-pid", action="store_true", default=True)

    p_list = sub.add_parser("list")
    p_list.add_argument("--active", action="store_true")

    p_arc = sub.add_parser("archive")
    p_arc.add_argument("--session-id", required=True)

    args = parser.parse_args()
    reg = SessionRegistry()

    try:
        if args.cmd == "register":
            result = reg.register(args.session_id, args.brief, args.pid)
        elif args.cmd == "write-set":
            status_pairs = []
            sargs = args.status or []
            for i in range(0, len(sargs), 2):
                if i + 1 < len(sargs):
                    status_pairs.append((sargs[i], sargs[i + 1]))
            result = reg.write_set(args.session_id, add=args.add or None, status=status_pairs or None)
        elif args.cmd == "claimants":
            result = {"session_ids": reg.claimants(args.file, active_only=args.active_only)}
        elif args.cmd == "attribution":
            result = {"attribution": reg.attribution(args.files)}
        elif args.cmd == "phase":
            result = reg.phase(args.session_id, args.phase)
        elif args.cmd == "gc":
            result = {"archived": reg.gc(max_age_sec=args.max_age, stale_pid=args.stale_pid)}
        elif args.cmd == "list":
            result = {"sessions": reg.list(active_only=args.active)}
        elif args.cmd == "archive":
            result = reg.archive(args.session_id)
        else:  # pragma: no cover
            parser.print_help()
            return 0
        _out(result)
        return 0
    except (ValueError, OSError) as exc:
        # fail-open: 自身异常 → 降级输出 + exit 0（不阻断业务）
        log_degraded(DEFAULT_DEGRADED_LOG, "session-registry", f"{args.cmd} error: {exc}")
        _out({"status": "degraded", "reason": str(exc), "degraded": True})
        return 0


if __name__ == "__main__":
    sys.exit(main())
