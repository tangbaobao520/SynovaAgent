#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
derive-board-sources.py — 任务看板多源派生脚本（D502）

一句话: git fetch origin/main → 从 origin/main（非工作区）读四个数据源 →
        写单一 snapshot JSON，供 task-board-adapter 的 syncOnce 消费。

四源（全部以 origin/main 为准，根治工作区滞后——D501 教训）:
  ① task-state/D###.json          Mac 任务状态机（权威，去重优先）
  ② git log 派生 Win D#           Win 任务（作者 Synova-Win/ClawOrg-Win/ClawOrg；
                                   窗口 >= --since-d，默认 328 = 多机 PR 工作流起点）
  ③ product-progress.json         26 条产品线完成度（CI product-progress.yml 产物）
  ④ todos.yaml                    待规划 T-*-##（AUTO 区机器聚合产物）

契约（铁律 47）:
  @input  — git 仓库（--repo-root）+ 远端（--remote，默认 origin）
  @output --out 指定的 snapshot JSON:
    {
      "generated_at": "ISO8601",
      "head": "<origin/main sha>",
      "task_state":  { "tasks": [...], "degraded": bool, "errors": [...] },
      "win_tasks":   { "tasks": [...], "degraded": bool, "errors": [...] },
      "product_lines": { "lines": [...], "overall_pct": int, "degraded": bool, "errors": [...] },
      "todos":       { "items": [...], "degraded": bool, "errors": [...] },
      "backlog":     { "items": [...], "degraded": bool, "errors": [...] },
      "degraded": bool, "errors": [...]
    }
  降级（铁律 24/31）:
    - 单源缺失/坏 JSON → 该源 degraded=true + errors[]，其余源继续（不整体失败）
    - git fetch 失败 → 降级用本地已有 origin/main（记 errors，不阻断）
    - origin/main 不存在 → exit 2（硬失败，绝不写空/半空 snapshot 覆盖旧数据——M1 教训）
  幂等: 同一 HEAD + 同源数据 → 输出逐字节稳定（除 generated_at）；重复执行安全。

Win D# 状态映射:
  - 有 K3 审计报告（docs/synova/audit-reports/*.md 内容含 \\bD#\\b）→ "audited"
  - 有提交无审计 → "committed"
  （committed 但被 task-state 覆盖的 D# 在 sync.js 层去重时丢弃，task-state 优先）

Win D# 标题: 取最新一条非簿记提交（subject 不以 "chore: bypass" / "chore(D#): bypass"
开头）的 subject，剥 "feat(D#): / fix(D#): " 前缀；全部是簿记则用最新一条。

用法:
  python3 derive-board-sources.py --repo-root /path/to/SynovaAgent \
      [--out ~/.dsh/task-board/source-snapshot.json] [--remote origin] \
      [--since-d 328] [--no-fetch] [--help]

退出码（D328 三态）:
  0 = 成功（可含单源 degraded）
  1 = 参数错误
  2 = 硬失败（origin/main 不存在 / git 不可用 / 无法写 snapshot）
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

MAIN_REF = "refs/remotes/origin/main"

# Win 作者集合（品牌迁移历史: ClawOrg → Synova）。显式声明、可审计（对齐
# gen-task-board.py 的 AUTHOR_BRAND_MAP 语义；git 原始 author 是历史事实不改）。
WIN_AUTHORS = {"ClawOrg-Win", "Synova-Win", "ClawOrg"}

# 簿记提交（bypass.log 补记类）不算任务实质进展，只用于存在性判断
BOOKKEEPING_RE = re.compile(r"^chore(\([D0-9]+\))?:\s*bypass", re.IGNORECASE)

TASK_STATE_FILE_RE = re.compile(r"^D\d+\.json$")
D_NUM_RE = re.compile(r"^D(\d+)$")


def git(repo_root, *args, timeout=120):
    """跑一条 git 命令，返回 stdout（str）。失败抛 RuntimeError。"""
    cmd = ["git", "-C", str(repo_root), *args]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"git 执行失败 {' '.join(cmd[:4])}...: {exc}") from exc
    if proc.returncode != 0:
        raise RuntimeError(
            f"git 退出 {proc.returncode}: {' '.join(cmd[:4])}... :: {proc.stderr.strip()[:200]}"
        )
    return proc.stdout


def ref_exists(repo_root, ref):
    try:
        git(repo_root, "rev-parse", "--verify", "--quiet", ref)
        return True
    except RuntimeError:
        return False


def read_source_1_task_state(repo_root, head, errors):
    """① task-state/D###.json @ origin/main。目录缺失 → degraded。"""
    out = {"tasks": [], "degraded": False, "errors": []}
    try:
        listing = git(repo_root, "ls-tree", "-r", "--name-only", head, "--", "task-state/")
    except RuntimeError as exc:
        out["degraded"] = True
        out["errors"].append(f"ls-tree task-state 失败: {exc}")
        return out
    files = [f for f in listing.splitlines() if TASK_STATE_FILE_RE.match(Path(f).name)]
    for rel in files:
        try:
            raw = json.loads(git(repo_root, "show", f"{head}:{rel}"))
            if isinstance(raw, dict):
                out["tasks"].append(raw)
        except (RuntimeError, json.JSONDecodeError) as exc:
            out["degraded"] = True
            out["errors"].append(f"{rel}: 解析失败 {exc}")
    return out


def read_audit_report_texts(repo_root, head, errors):
    """读取全部审计报告文本，用于 Win D# 的 audited 判定（内容 grep \\bD#\\b）。"""
    try:
        listing = git(
            repo_root, "ls-tree", "-r", "--name-only", head, "--",
            "docs/synova/audit-reports/",
        )
    except RuntimeError as exc:
        errors.append(f"ls-tree audit-reports 失败: {exc}")
        return ""
    parts = []
    for rel in listing.splitlines():
        if not rel.endswith(".md"):
            continue
        try:
            parts.append(git(repo_root, "show", f"{head}:{rel}"))
        except RuntimeError:
            continue  # 单文件失败不影响整体（该报告不参与判定）
    return "\n".join(parts)


def read_source_2_win_tasks(repo_root, head, since_d, ts_ids, errors):
    """② git log 派生 Win D#（窗口 >= since_d，排除 task-state 已有）。

    @param ts_ids: task-state 已有的 D# 集合（去重：task-state 优先）。
    """
    out = {"tasks": [], "degraded": False, "errors": []}
    log_fmt = "%H%x00%an%x00%ad%x00%s"
    try:
        log_text = git(
            repo_root, "log", head, f"--pretty=format:{log_fmt}",
            "--date=short", "--grep=D[0-9]",
        )
    except RuntimeError as exc:
        out["degraded"] = True
        out["errors"].append(f"git log 失败: {exc}")
        return out

    # D# → 提交列表（git log 最新在前）
    d_commits = {}
    for line in log_text.splitlines():
        parts = line.split("\x00", 3)
        if len(parts) != 4:
            continue
        h, author, date, subject = parts
        for d in re.findall(r"D\d+", subject):
            m = D_NUM_RE.match(d)
            if not m or int(m.group(1)) < since_d:
                continue
            if d not in d_commits:
                d_commits[d] = []
            d_commits[d].append(
                {"hash": h, "author": author, "date": date, "subject": subject}
            )

    audit_text = read_audit_report_texts(repo_root, head, errors)
    audited_ids = set(re.findall(r"\b(D\d+)(?!\d)", audit_text)) if audit_text else set()

    for d, commits in d_commits.items():
        if d in ts_ids:
            continue  # 去重：task-state 优先
        win_commits = [c for c in commits if c["author"] in WIN_AUTHORS]
        pool = win_commits if win_commits else commits  # 无 Win 作者提交也保留（git 派生事实）
        latest = pool[0]
        # 标题: 最新非簿记提交；全簿记则用最新
        titled = next((c for c in pool if not BOOKKEEPING_RE.match(c["subject"])), latest)
        title = re.sub(r"^(feat|fix|chore|docs|refactor|test)\((?:D\d+)(?:[^)]*)\):\s*", "", titled["subject"])
        title = re.sub(r"^\[(?:D\d+)\]\s*", "", title).strip() or f"{d} 任务"
        out["tasks"].append({
            "task_id": d,
            "title": title[:80],
            "owner": "Win" if win_commits else "git",
            "commits": len(commits),
            "author": latest["author"],
            "date": latest["date"],
            "status": "audited" if d in audited_ids else "committed",
        })
    out["tasks"].sort(key=lambda t: int(D_NUM_RE.match(t["task_id"]).group(1)))
    return out


def read_source_3_product_lines(repo_root, head, errors):
    """③ product-progress.json @ origin/main。缺失 → degraded（不猜数字）。"""
    out = {"lines": [], "overall_pct": None, "degraded": False, "errors": []}
    try:
        raw = json.loads(
            git(repo_root, "show", f"{head}:docs/synova/product-lines/product-progress.json")
        )
    except (RuntimeError, json.JSONDecodeError) as exc:
        out["degraded"] = True
        out["errors"].append(f"product-progress.json 读取失败: {exc}")
        return out
    for line in raw.get("lines", []):
        out["lines"].append({
            "id": line.get("id"),
            "name": line.get("name", "?"),
            "total": line.get("total", 0),
            "verified": line.get("verified", 0),
            "progress_pct": line.get("progress_pct", 0),
            "generated_at": raw.get("generated_at"),
        })
    out["overall_pct"] = raw.get("product_progress_pct")
    return out


def parse_todos_yaml(text):
    """轻量解析 todos.yaml AUTO 区的 todos 列表（自写，因系统无 PyYAML）。

    仅支持本仓已知 schema（aggregate-todos.py 产物）:
      - id: "T-1-01"
        line: 1
        title: "..."
        source: "..."
        priority: P0
        owner: "..."
        depends: [...] 或 []
        acceptance: "..."
    字段解析失败 → 该条跳过并计数（诚实降级，不猜）。
    @returns (items, parse_errors)
    """
    items, errs = [], []
    if not text:
        return items, errs
    # 找 AUTO 区（若无 marker 则整文件）
    auto_m = re.search(r"#\s*AUTO:START(.*?)#\s*AUTO:END", text, re.DOTALL)
    body = auto_m.group(1) if auto_m else text
    blocks = re.split(r"\n(?=  - id: )", body)
    # 带引号值支持转义引号（如 title: "报告\"一看就懂\"..."）；裸值（P0）另一分支。
    QUOTED_RE = {
        "id": re.compile(r'^\s*- id:\s*"((?:[^"\\]|\\.)*)"\s*$'),
        "title": re.compile(r'^\s*title:\s*"((?:[^"\\]|\\.)*)"\s*$'),
        "owner": re.compile(r'^\s*owner:\s*"((?:[^"\\]|\\.)*)"\s*$'),
        "acceptance": re.compile(r'^\s*acceptance:\s*"((?:[^"\\]|\\.)*)"\s*$'),
    }
    BARE_RE = {
        "line": re.compile(r"^\s*line:\s*(\d+)\s*$"),
        "priority": re.compile(r"^\s*priority:\s*(P\d+)\s*$"),
    }

    def unquote(val):
        return val.replace('\\"', '"').replace("\\\\", "\\")

    for block in blocks:
        if not re.search(r"^\s*- id:", block):
            continue
        item, got_id = {}, False
        for ln in block.splitlines():
            matched = False
            for key, rex in QUOTED_RE.items():
                m = rex.match(ln)
                if m:
                    item[key] = unquote(m.group(1)).strip()
                    matched = True
                    if key == "id":
                        got_id = True
                    break
            if matched:
                continue
            for key, rex in BARE_RE.items():
                m = rex.match(ln)
                if m:
                    val = m.group(1).strip()
                    if key == "line":
                        val = int(val)
                    item[key] = val
                    break
        if got_id and "title" in item:
            items.append(item)
        elif got_id:
            errs.append(f"{item.get('id', '?')}: 缺 title，跳过")
    return items, errs


def read_source_4_todos(repo_root, head, errors):
    """④ todos.yaml @ origin/main。缺失 → degraded。"""
    out = {"items": [], "degraded": False, "errors": []}
    try:
        text = git(repo_root, "show", f"{head}:docs/synova/product-lines/todos.yaml")
    except RuntimeError as exc:
        out["degraded"] = True
        out["errors"].append(f"todos.yaml 读取失败: {exc}")
        return out
    items, parse_errs = parse_todos_yaml(text)
    out["items"] = items
    if parse_errs:
        out["degraded"] = True
        out["errors"].extend(parse_errs)
    return out


def read_source_5_backlog(repo_root, head, errors):
    """⑤ board-backlog.json（无 D# 人工薄层）。缺失 = 正常（空）。"""
    out = {"items": [], "degraded": False, "errors": []}
    try:
        raw = json.loads(
            git(repo_root, "show", f"{head}:docs/synova/coordination/board-backlog.json")
        )
        out["items"] = raw.get("backlog", []) if isinstance(raw, dict) else []
    except RuntimeError:
        return out  # 文件缺失 = 无待规划人工层，正常
    except json.JSONDecodeError as exc:
        out["degraded"] = True
        out["errors"].append(f"board-backlog.json 解析失败: {exc}")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="任务看板多源派生（D502）")
    ap.add_argument("--repo-root", default=".", help="Synova 仓库根（默认 cwd）")
    ap.add_argument("--out", default=str(Path.home() / ".dsh" / "task-board" / "source-snapshot.json"))
    ap.add_argument("--remote", default="origin", help="远端名（默认 origin）")
    ap.add_argument("--since-d", type=int, default=328,
                    help="Win D# 上板窗口下界（默认 328 = 多机 PR 工作流起点）")
    ap.add_argument("--no-fetch", action="store_true", help="跳过 git fetch（测试用）")
    args = ap.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    errors = []

    # git 可用性（D328: 只探存在性不够，直接真跑一条）
    try:
        git(repo_root, "rev-parse", "--git-dir", timeout=15)
    except RuntimeError as exc:
        print(f"[derive] 硬失败: {repo_root} 不是 git 仓库 — {exc}", file=sys.stderr)
        return 2

    # fetch（只更新 remote-tracking ref，不碰工作区/不碰本地 main）
    if not args.no_fetch:
        try:
            git(repo_root, "fetch", "--no-tags", args.remote,
                f"+refs/heads/main:{MAIN_REF}", timeout=120)
        except RuntimeError as exc:
            errors.append(f"git fetch 降级（用本地 {MAIN_REF}）: {exc}")

    if not ref_exists(repo_root, MAIN_REF):
        print(f"[derive] 硬失败: {MAIN_REF} 不存在且 fetch 失败，拒绝写 snapshot", file=sys.stderr)
        return 2
    head = git(repo_root, "rev-parse", MAIN_REF).strip()
    head = head.splitlines()[0] if head else ""

    s1 = read_source_1_task_state(repo_root, head, errors)
    ts_ids = {str(t.get("task_id", "")) for t in s1["tasks"]}
    s2 = read_source_2_win_tasks(repo_root, head, args.since_d, ts_ids, errors)
    s3 = read_source_3_product_lines(repo_root, head, errors)
    s4 = read_source_4_todos(repo_root, head, errors)
    s5 = read_source_5_backlog(repo_root, head, errors)

    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "head": head,
        "task_state": s1,
        "win_tasks": s2,
        "product_lines": s3,
        "todos": s4,
        "backlog": s5,
        "degraded": any(s["degraded"] for s in (s1, s2, s3, s4, s5)),
        "errors": errors,
    }

    out_path = Path(args.out).expanduser()
    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = out_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(out_path)  # 原子写（读者永远看不到半截 JSON）
    except OSError as exc:
        print(f"[derive] 硬失败: 无法写 {out_path} — {exc}", file=sys.stderr)
        return 2

    print(
        f"[derive] OK head={head[:8]} task_state={len(s1['tasks'])} "
        f"win={len(s2['tasks'])} lines={len(s3['lines'])} todos={len(s4['items'])} "
        f"backlog={len(s5['items'])} degraded={snapshot['degraded']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
