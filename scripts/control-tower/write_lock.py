#!/usr/bin/env python3
"""
write-lock.py — 写入锁 (D209)

轻量级文件锁: Agent 在写文件前 acquire 锁(基于文件路径 hash),
写完 release, 超时自动释放 + 告警。

权威文档 #17 第四章:
  §2.1 — 基于文件系统(.write-locks/ 目录), 每个锁文件包含 PID + 时间戳
  §3.1 — 状态转换: FREE -> LOCKED(acquire) -> RELEASED / TIMEOUT / ERROR
  §5   — 降级: 锁目录不可创建 -> log.warn + 允许写入

Usage:
  from write_lock import WriteLock
  lock = WriteLock()
  result = lock.acquire("src/routes/ga-admin.ts", owner="agent-1")
  if result["acquired"]:
      try:
          # ... write file ...
      finally:
          lock.release("src/routes/ga-admin.ts")
"""

import hashlib
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass
import time
import logging
from pathlib import Path
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger("write-lock")


class WriteLock:
    """基于文件系统的轻量级写入锁。"""

    LOCK_DIR = ".write-locks"
    DEFAULT_TIMEOUT_SEC = 300  # 5 分钟

    def __init__(self, lock_dir: Optional[str] = None, timeout_sec: Optional[int] = None):
        self.lock_dir = Path(lock_dir or self.LOCK_DIR)
        self.timeout_sec = timeout_sec or self.DEFAULT_TIMEOUT_SEC

    # ── 核心方法 ──

    def acquire(self, file_path: str, owner: str = "agent") -> dict:
        """
        获取文件写入锁（**原子**）。

        D847: 由「`lock_path.exists()` 探测 + 写」改为 **`os.open(O_CREAT|O_EXCL)` 原子创建**，
        消除 check-then-act 竞态（`session_registry.py:79` 记录的 D209 遗留：两进程可同时"成功"
        获取同一把锁 → 上层的 read-modify-write 仍丢更新）。过期锁（timestamp 超 `timeout_sec`
        = 持锁进程崩溃残留）回收后**重试一次**，避免永久死锁。

        Args:
            file_path: 相对项目根的文件路径 (如 "src/routes/ga-admin.ts")
            owner:     lock 持有者标识 (默认 "agent")

        Returns:
            {"acquired": True, "lock_id": str} 或 {"acquired": False, "reason": str}
            降级（锁目录/锁文件不可用，D209 §5 契约）:
            {"acquired": True, "lock_id": "", "degraded": True, "reason": str}
        """
        try:
            self._ensure_lock_dir()
        except OSError as e:
            log.warning("锁目录不可创建 (%s) — 降级允许写入", e)
            return {"acquired": True, "lock_id": "", "degraded": True,
                    "reason": f"锁目录不可创建: {e}"}

        lock_id = self._lock_id(file_path)
        lock_path = self.lock_dir / lock_id
        payload = json.dumps(
            {
                "pid": os.getpid(),
                "timestamp": time.time(),
                "owner": owner,
                "file_path": file_path,
            },
            ensure_ascii=False,
        ).encode("utf-8")

        for _attempt in (1, 2):  # 第 2 次 = 回收过期锁后的重试
            try:
                fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
            except FileExistsError:
                if not self._is_expired(lock_path):
                    # 未过期 = 有活着的持有者 → 拒绝（不抢锁）
                    return {"acquired": False, "reason": f"文件已被锁定: {lock_id}"}
                log.info("锁已超时 (%s) — 回收后重试", lock_id)
                try:
                    lock_path.unlink(missing_ok=True)
                except OSError as e:
                    return {"acquired": False, "reason": f"过期锁回收失败: {e}"}
                continue
            except OSError as e:
                # 只读锁目录等 → D209 §5 降级允许写入（**显式可见**，不静默）
                log.warning("锁文件创建失败 (%s) — 降级允许写入", e)
                return {"acquired": True, "lock_id": "", "degraded": True,
                        "reason": f"锁文件创建失败: {e}"}
            try:
                with os.fdopen(fd, "wb") as fh:
                    fh.write(payload)
            except OSError as e:
                try:
                    lock_path.unlink(missing_ok=True)
                except OSError:
                    pass  # swallow-ok: 清理失败不掩盖主因，下面按降级返回并告警
                log.warning("锁文件写入失败 (%s) — 降级允许写入", e)
                return {"acquired": True, "lock_id": "", "degraded": True,
                        "reason": f"锁文件写入失败: {e}"}
            log.info("锁已获取: %s (owner=%s)", lock_id, owner)
            return {"acquired": True, "lock_id": lock_id}

        return {"acquired": False, "reason": f"文件已被锁定: {lock_id}"}

        # 写入锁文件
        try:
            lock_data = {
                "pid": os.getpid(),
                "timestamp": time.time(),
                "owner": owner,
                "file_path": file_path,
            }
            lock_path.write_text(json.dumps(lock_data, ensure_ascii=False), encoding="utf-8")
            log.info("锁已获取: %s (owner=%s)", lock_id, owner)
            return {"acquired": True, "lock_id": lock_id}
        except OSError as e:
            log.warning("锁文件写入失败 (%s) — 降级允许写入", e)
            return {"acquired": True, "lock_id": "", "degraded": True}

    def release(self, file_path: str) -> dict:
        """
        释放文件写入锁。

        仅当锁文件中的 PID 与当前进程一致时才删除 (防止误删其他 Agent 的锁)。

        Returns:
            {"released": True} 或 {"released": False, "reason": str}
        """
        lock_id = self._lock_id(file_path)
        lock_path = self.lock_dir / lock_id

        # D847: exists() 也要在 try 内 —— 只读/无执行权限的锁目录上 stat() 会抛 PermissionError，
        # 基线会把它抛给调用方（违反 D209 §5「锁不可用 → 降级」契约）。
        try:
            if not lock_path.exists():
                return {"released": True, "reason": "锁不存在（无需释放）"}
            data = json.loads(lock_path.read_text(encoding="utf-8"))
            if data.get("pid") != os.getpid():
                return {"released": False, "reason": "锁属于其他进程，无法释放"}
            lock_path.unlink(missing_ok=True)
            log.info("锁已释放: %s", lock_id)
            return {"released": True}
        except (json.JSONDecodeError, OSError) as e:
            log.warning("锁释放失败 (%s) — 强制删除", e)
            try:
                lock_path.unlink(missing_ok=True)
            except OSError as e2:
                return {"released": False, "degraded": True, "reason": f"锁文件不可删: {e2}"}
            return {"released": True, "degraded": True}

    def wait(self, file_path: str, timeout_sec: int = 60) -> dict:
        """
        等待锁释放 (轮询)。

        Args:
            file_path:    文件路径
            timeout_sec:  最长等待秒数 (默认 60)

        Returns:
            {"acquired": True, "lock_id": str} 或 {"acquired": False, "reason": "wait timeout"}
        """
        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            result = self.acquire(file_path)
            if result.get("acquired"):
                return result
            time.sleep(1)
        return {"acquired": False, "reason": f"等待超时 ({timeout_sec}s)"}

    def is_locked(self, file_path: str) -> bool:
        """检查文件是否被锁定 (存在且未超时)。"""
        lock_id = self._lock_id(file_path)
        lock_path = self.lock_dir / lock_id
        if not lock_path.exists():
            return False
        if self._is_expired(lock_path):
            return False
        return True

    # ── 内部方法 ──

    def _ensure_lock_dir(self) -> None:
        """确保锁目录存在。"""
        self.lock_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _lock_id(file_path: str) -> str:
        """基于文件路径的 SHA256 前 16 位生成锁文件名。"""
        return hashlib.sha256(file_path.encode("utf-8")).hexdigest()[:16]

    def _is_expired(self, lock_path: Path) -> bool:
        """锁是否过期（= 可回收）。

        契约:
          @output True = 过期（持锁进程崩溃残留，可回收）；False = 仍在有效期内（**不可抢**）
          @degraded 内容不可解析（含 D847 实测到的"`O_EXCL` 已创建、payload 尚未写入"的空窗口，
                    以及半写/损坏）→ 退回 **mtime** 判定：mtime 在 `timeout_sec` 内 → **不算过期**
                    （fail-closed，绝不抢活锁；否则两进程会同时进临界区 → 又丢更新）。
          @exit 不抛异常（stat 失败 → True，由调用方 unlink 分支显式报错）
        D847 实测教训: 基线"损坏锁 = 过期"的宽容口径 + 原子创建后的空窗口 = 抢锁 → lost-update
          在 8 进程并发第 1 轮即复现（本卡夹具当场红）。宽容口径只允许对**确实陈旧**的锁生效。
        """
        try:
            data = json.loads(lock_path.read_text(encoding="utf-8"))
            elapsed = time.time() - data.get("timestamp", 0)
            return elapsed > self.timeout_sec
        except (json.JSONDecodeError, OSError, TypeError, ValueError, AttributeError):
            try:
                return (time.time() - lock_path.stat().st_mtime) > self.timeout_sec
            except OSError:
                return True


# ═══ CLI ═══

def _emit_signal(status: str, reason: str) -> None:
    """D214 信号发射 (委托 emit-signal.py，原子写入)"""
    import subprocess
    try:
        script = os.path.join(os.path.dirname(__file__), "emit-signal.py")
        subprocess.run([sys.executable, script, "write-lock", status, reason],
                       check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass  # 降级


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Synova 写入锁")
    parser.add_argument("action", choices=["acquire", "release", "wait", "is-locked", "help"],
                        help="操作类型")
    parser.add_argument("file", nargs="?",
                        help="文件路径 (相对项目根)")
    parser.add_argument("--owner", default="agent",
                        help="锁持有者标识 (默认: agent)")
    parser.add_argument("--timeout", type=int, default=60,
                        help="等待超时秒数 (默认: 60)")
    parser.add_argument("--lock-dir", default=".write-locks",
                        help="锁目录路径 (默认: .write-locks)")

    args = parser.parse_args()

    if args.action == "help":
        parser.print_help()
        sys.exit(0)

    if args.action != "help" and not args.file:
        parser.error("文件路径必填")

    lock = WriteLock(lock_dir=args.lock_dir)

    if args.action == "acquire":
        result = lock.acquire(args.file, owner=args.owner)
    elif args.action == "release":
        result = lock.release(args.file)
    elif args.action == "wait":
        result = lock.wait(args.file, timeout_sec=args.timeout)
    elif args.action == "is-locked":
        result = {"locked": lock.is_locked(args.file)}

    # D214 信号
    _sig_st = "green"
    _sig_reason = f"{args.action}_ok"
    if not result.get("acquired", True) or not result.get("released", True):
        _sig_st = "red" if args.action == "wait" else "yellow"
        _sig_reason = result.get("reason", f"{args.action}_failed")
    elif result.get("degraded"):
        _sig_st = "yellow"
        _sig_reason = f"{args.action}_degraded"
    _emit_signal(_sig_st, _sig_reason)

    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result.get("acquired") is not False and result.get("released") is not False else 1)


if __name__ == "__main__":
    main()
