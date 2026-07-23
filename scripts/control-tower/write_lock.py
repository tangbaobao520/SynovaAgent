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
        获取文件写入锁。

        Args:
            file_path: 相对项目根的文件路径 (如 "src/routes/ga-admin.ts")
            owner:     lock 持有者标识 (默认 "agent")

        Returns:
            {"acquired": True, "lock_id": str} 或 {"acquired": False, "reason": str}
        """
        try:
            self._ensure_lock_dir()
        except OSError as e:
            log.warning("锁目录不可创建 (%s) — 降级允许写入", e)
            return {"acquired": True, "lock_id": "", "degraded": True}

        lock_id = self._lock_id(file_path)
        lock_path = self.lock_dir / lock_id

        # 检查是否存在未超时的锁
        if lock_path.exists():
            if self._is_expired(lock_path):
                log.info("锁已超时 (%s) — 自动释放", lock_id)
                lock_path.unlink(missing_ok=True)
            else:
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

        if not lock_path.exists():
            return {"released": True, "reason": "锁不存在（无需释放）"}

        try:
            data = json.loads(lock_path.read_text(encoding="utf-8"))
            if data.get("pid") != os.getpid():
                return {"released": False, "reason": "锁属于其他进程，无法释放"}
            lock_path.unlink(missing_ok=True)
            log.info("锁已释放: %s", lock_id)
            return {"released": True}
        except (json.JSONDecodeError, OSError) as e:
            log.warning("锁释放失败 (%s) — 强制删除", e)
            lock_path.unlink(missing_ok=True)
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
        """检查锁文件是否超时。"""
        try:
            data = json.loads(lock_path.read_text(encoding="utf-8"))
            elapsed = time.time() - data.get("timestamp", 0)
            return elapsed > self.timeout_sec
        except (json.JSONDecodeError, OSError):
            return True  # 损坏的锁文件视为超时


# ═══ CLI ═══

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

    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result.get("acquired") is not False and result.get("released") is not False else 1)


if __name__ == "__main__":
    main()
