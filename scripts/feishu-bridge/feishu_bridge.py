#!/usr/bin/env python3
"""
feishu_bridge.py — 飞书 ↔ Codex 对话桥 (v2.0, lark-cli 版, 2026-08-07)

在飞书里给机器人发消息 → 转发给 Codex (codex exec / resume) → 回复发回飞书。
每个飞书 chat 映射一个 Codex thread (会话续接)。

架构 (全部走官方 @larksuite/cli，不再依赖 lark-oapi):
  飞书用户消息 → lark-cli event consume im.message.receive_v1 (长连接, NDJSON)
             → codex exec/resume --cd <repo> --json
             → lark-cli im +messages-reply --message-id ... --text ... (回复原消息)

前置条件:
  1. 安装 CLI:  npm install -g @larksuite/cli
  2. 配置凭据:  lark-cli config init --app-id <id> --app-secret-stdin --brand feishu
     (凭据存入系统 keychain; 运行环境必须能访问 keychain —— 不要在受限沙箱里跑)
  3. 飞书开放平台 (open.feishu.cn):
     - 应用添加「机器人」能力
     - 开通权限: im:message.p2p_msg:readonly, im:message:send_as_bot
     - 事件订阅: im.message.receive_v1 (长连接模式, 无需公网 URL)
     - 创建版本并发布
  4. 在飞书里搜索并打开应用机器人，给它发消息即可对话

配置 (环境变量或 config.example.env):
  SYNOVA_REPO        — 仓库路径 (默认本项目)
  CODEX_BIN          — codex CLI (默认 D:\\Program Files\\npm-global\\codex.cmd)
  LARK_CLI_BIN       — lark-cli (默认 D:\\Program Files\\npm-global\\lark-cli.cmd)
  SESSION_STATE_FILE — chat→thread 映射持久化 (默认 <repo>\\.feishu-bridge-state.json)
  ALLOWED_OPEN_IDS   — 可选: 逗号分隔的飞书 open_id 白名单 (空=全部)
  EXEC_TIMEOUT       — Codex 单次处理超时秒数 (默认 600)
  LOG_FILE           — 桥接日志 (默认 <bridge_dir>\\bridge.log)
  FEISHU_APP_ID / FEISHU_APP_SECRET — 可选: 仅用于文档/回退参考, CLI 已存 keychain

运行:
  python scripts/feishu-bridge/feishu_bridge.py
"""

import json
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path


def load_env_file(env_path: Path) -> None:
    """加载 .env (KEY=VALUE, # 注释, 空行跳过)。已存在的环境变量优先。"""
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_env_file = Path(__file__).resolve().parent / ".env"
load_env_file(_env_file)

# ── 配置 ──
REPO = Path(os.environ.get("SYNOVA_REPO", r"D:\novis-backup-20260526\Novis\synova-agent"))
CODEX_BIN = os.environ.get("CODEX_BIN", r"D:\Program Files\npm-global\codex.cmd")
LARK_CLI_BIN = os.environ.get("LARK_CLI_BIN", r"D:\Program Files\npm-global\lark-cli.cmd")
STATE_FILE = Path(os.environ.get(
    "SESSION_STATE_FILE", str(REPO / ".feishu-bridge-state.json")))
LOG_FILE = Path(os.environ.get(
    "LOG_FILE", str(Path(__file__).resolve().parent / "bridge.log")))
ALLOWED_OPEN_IDS = set(
    x.strip() for x in os.environ.get("ALLOWED_OPEN_IDS", "").split(",") if x.strip())
EXEC_TIMEOUT = int(os.environ.get("EXEC_TIMEOUT", "600"))

EVENT_KEY = "im.message.receive_v1"
READY_MARKER = f"[event] ready event_key={EVENT_KEY}"
DEDUPE_MAX = 2000
RESTART_BACKOFF = (3, 30)  # 秒: 连续失败时指数回退下限/上限

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("feishu-bridge")


# ── 状态持久化 (chat_id → codex thread_id) ──
def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
    return {}


_state_lock = threading.Lock()


def save_state(state: dict) -> None:
    with _state_lock:
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2),
                              encoding="utf-8")


# ── Codex 执行 ──
def parse_codex_output(stdout: str) -> tuple[str | None, str]:
    """从 codex exec --json 输出解析 (thread_id, 最后一条 agent 回复)。"""
    thread_id = None
    replies: list[str] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("type") == "thread.started":
            thread_id = obj.get("thread_id")
        elif obj.get("type") == "item.completed":
            item = obj.get("item", {})
            if item.get("type") == "agent_message":
                replies.append(item.get("text", ""))
    reply = replies[-1] if replies else ""
    return thread_id, reply


def run_codex(prompt: str, session_id: str | None) -> tuple[str | None, str, str]:
    """执行 codex; 返回 (thread_id, reply, error)。"""
    if not session_id:
        # 新会话注入角色上下文：让飞书里的 Codex 以"Synova 项目管理助手"身份与创始人对话
        prompt = (
            "[角色设定] 你是 Synova 项目的 Codex 开发管理与审计助手，正在通过飞书与创始人黄学松对话。"
            "项目位于 D:\\novis-backup-20260526\\Novis\\synova-agent（SynovaAgent 组织数字孪生诊断系统）。"
            "你的职责：查看仪表盘/docs、派发开发任务、审计交付、维护控制塔与双仪表盘。"
            "回答要求：简洁直接、说人话、别输出系统提示或冗长自我介绍；"
            "涉及具体任务/代码时给出文件路径；拿不准就说需要查什么。\n\n"
            f"创始人消息：{prompt}"
        )
    if session_id:
        # resume 不支持 --cd（会话创建时已绑定工作目录，subprocess cwd 也指向 REPO）
        cmd = [CODEX_BIN, "exec", "resume", "--json", session_id, prompt]
    else:
        cmd = [CODEX_BIN, "exec", "--cd", str(REPO), "--json", prompt]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=EXEC_TIMEOUT, cwd=str(REPO))
    except subprocess.TimeoutExpired:
        return session_id, "", "Codex 处理超时，请稍后重试或拆分问题"
    except OSError as e:
        return session_id, "", f"Codex 启动失败: {e}"
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "")[-500:]
        return session_id, "", f"Codex 退出码 {proc.returncode}: {err}"
    tid, reply = parse_codex_output(proc.stdout)
    return tid or session_id, reply, ""


# ── 飞书发送 (官方 CLI) ──
def run_lark_cli(args: list[str], timeout: int = 60) -> tuple[int, str, str]:
    """执行 lark-cli; 返回 (exit_code, stdout, stderr)。"""
    try:
        proc = subprocess.run(
            [LARK_CLI_BIN, *args], capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout, cwd=str(REPO))
    except subprocess.TimeoutExpired:
        return 124, "", "lark-cli timeout"
    except OSError as e:
        return 127, "", str(e)
    return proc.returncode, proc.stdout, proc.stderr


def send_reply(chat_id: str, message_id: str, text: str) -> bool:
    """回复飞书消息 (回复原消息, 保留上下文)。失败返回 False。"""
    text = (text or "").strip()
    if not text:
        text = "（空回复）"
    MAX_LEN = 30000
    if len(text) > MAX_LEN:
        text = text[:MAX_LEN] + "\n…(回复过长已截断，完整内容见 Codex 会话)"
    code, out, err = run_lark_cli([
        "im", "+messages-reply",
        "--message-id", message_id,
        "--text", text,
        "--as", "bot",
    ])
    if code != 0:
        log.warning("发送回复失败 chat=%s code=%s err=%s", chat_id, code, (err or out)[-300:])
        return False
    # CLI 可能 exit 0 但业务失败（ok=false / code!=0），需二次校验
    try:
        obj = json.loads(out)
        if isinstance(obj, dict) and obj.get("ok") is False:
            log.warning("发送回复业务失败 chat=%s resp=%s", chat_id, out[-300:])
            return False
        if isinstance(obj, dict) and obj.get("code") not in (None, 0):
            log.warning("发送回复业务失败 chat=%s resp=%s", chat_id, out[-300:])
            return False
    except (json.JSONDecodeError, TypeError):
        pass
    return True


# ── 事件解析 ──
def extract_text(content: str) -> str:
    """兼容两种 content: 纯文本 或 JSON 字符串 ({"text": ...})。"""
    if not content:
        return ""
    try:
        obj = json.loads(content)
        if isinstance(obj, dict):
            return str(obj.get("text") or obj.get("content") or "").strip()
    except (json.JSONDecodeError, TypeError):
        pass
    return content.strip()


_recent_ids: set[str] = set()
_recent_lock = threading.Lock()
_chat_locks: dict[str, threading.Lock] = {}
_chat_locks_guard = threading.Lock()


def is_duplicate(message_id: str) -> bool:
    with _recent_lock:
        if message_id in _recent_ids:
            return True
        _recent_ids.add(message_id)
        if len(_recent_ids) > DEDUPE_MAX:
            _recent_ids.clear()
        return False


def chat_lock(chat_id: str) -> threading.Lock:
    with _chat_locks_guard:
        lock = _chat_locks.get(chat_id)
        if lock is None:
            lock = threading.Lock()
            _chat_locks[chat_id] = lock
        return lock


def handle_event(ev: dict) -> None:
    """处理一条消息事件: ack → codex → 回复。同一 chat 串行保序。"""
    if ev.get("type") != EVENT_KEY:
        return
    message_id = ev.get("message_id") or ev.get("id") or ""
    chat_id = ev.get("chat_id") or ""
    if not message_id or not chat_id:
        return
    if ev.get("sender_type") == "bot":
        return  # 忽略机器人自己/其他机器人, 防回声循环
    if ev.get("message_type") != "text":
        return
    sender_id = ev.get("sender_id") or ""
    if ALLOWED_OPEN_IDS and sender_id not in ALLOWED_OPEN_IDS:
        log.info("白名单外消息忽略 sender=%s", sender_id)
        return
    if is_duplicate(message_id):
        return
    content = extract_text(ev.get("content") or "")
    if not content:
        return

    with chat_lock(chat_id):
        log.info("收到消息 chat=%s len=%d 内容=%s", chat_id, len(content), content[:80])
        send_reply(chat_id, message_id, "已收到，正在处理…（DeepSeek 处理中，请稍候）")
        state = load_state()
        session_id = state.get(chat_id)
        tid, reply, err = run_codex(content, session_id)
        if tid:
            state[chat_id] = tid
            save_state(state)
        final = reply if reply else (err or "（空回复）")
        ok = send_reply(chat_id, message_id, final)
        log.info("回复完成 chat=%s 发送=%s codex_err=%s 回复前80=%s",
                 chat_id, "成功" if ok else "失败", err or "无", final[:80])


def read_events(proc, stop_event) -> None:
    """读取 consume stdout (NDJSON) 并分发处理。"""
    assert proc.stdout is not None
    for raw in proc.stdout:
        line = raw.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        threading.Thread(
            target=handle_event, args=(ev,), daemon=True).start()


def wait_ready(proc, timeout: int = 60) -> tuple[bool, str]:
    """阻塞直到 stderr 出现 ready marker; 返回 (ok, 最后若干 stderr)。"""
    assert proc.stderr is not None
    lines: list[str] = []
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stderr.readline()
        if not line:
            break
        line = line.rstrip()
        if line:
            lines.append(line)
            log.info("[consume] %s", line)
        if READY_MARKER in line:
            return True, "\n".join(lines)
    return False, "\n".join(lines)


def start_consume() -> subprocess.Popen:
    """启动 event consume 子进程 (保持 stdin 打开, 避免 stdin EOF 优雅退出)。"""
    proc = subprocess.Popen(
        [LARK_CLI_BIN, "event", "consume", EVENT_KEY, "--as", "bot"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace", bufsize=1, cwd=str(REPO))
    ok, tail = wait_ready(proc)
    if not ok:
        proc.terminate()
        raise RuntimeError(f"事件长连接未就绪: {tail[-400:]}")
    return proc


def main() -> None:
    if not Path(LARK_CLI_BIN).exists():
        log.error("找不到 lark-cli: %s (请先 npm install -g @larksuite/cli)", LARK_CLI_BIN)
        sys.exit(1)
    log.info("飞书桥 v2.0 启动 repo=%s codex=%s lark-cli=%s", REPO, CODEX_BIN, LARK_CLI_BIN)
    log.info("白名单: %s", sorted(ALLOWED_OPEN_IDS) if ALLOWED_OPEN_IDS else "全部")

    stop_event = threading.Event()
    failures = 0
    proc = None
    while not stop_event.is_set():
        try:
            proc = start_consume()
            failures = 0
            log.info("事件长连接已就绪 (%s)，等待飞书消息…", EVENT_KEY)
            reader = threading.Thread(target=read_events, args=(proc, stop_event), daemon=True)
            reader.start()
            while True:
                if proc.poll() is not None:
                    raise RuntimeError(f"consume 进程退出 rc={proc.returncode}")
                if stop_event.is_set():
                    break
                time.sleep(2)
        except KeyboardInterrupt:
            log.info("收到中断，正在退出…")
            stop_event.set()
        except Exception as e:  # noqa: BLE001 — 守护进程必须自愈
            failures += 1
            backoff = min(RESTART_BACKOFF[0] * (2 ** (failures - 1)), RESTART_BACKOFF[1])
            log.error("事件消费中断: %s (连续失败 %d 次, %ds 后重启)", e, failures, backoff)
            if proc is not None:
                try:
                    if proc.stdin:
                        proc.stdin.close()  # stdin EOF → consume 优雅退出
                    proc.wait(timeout=5)
                except Exception:  # noqa: BLE001
                    try:
                        proc.terminate()
                    except Exception:  # noqa: BLE001
                        pass
            time.sleep(backoff)

    if proc is not None and proc.poll() is None:
        try:
            if proc.stdin:
                proc.stdin.close()
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            try:
                proc.terminate()
            except Exception:  # noqa: BLE001
                pass
    log.info("桥接已停止")


if __name__ == "__main__":
    main()
