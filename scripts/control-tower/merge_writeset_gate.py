#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/merge_writeset_gate.py — D708 合并级写集对账 gate

背景（M2 族第三次止血）:
  #449 夹带 D603 共 51 文件 / #442 夹带 6 文件 / D593-FIX 声称提交实未提交 —— 三次
  「PR 声称的写集」与「真正进入 main 的文件集」不一致，而现有门禁都抓不到：
    - pre-commit 13 组：单提交粒度，只看暂存区，不看 PR 整体
    - verify-parallel.sh（ci.yml L51-57）：**已合 PR 之间**的写集重叠（inter-PR），
      不校验单个 PR 与**自己声明**的一致性（intra-PR）
  本 gate 补的正是 intra-PR 这一格：一个 PR 从「通过的写集」到「真正进入 main 的文件集」
  之间不许出现夹带；出现即红并逐文件点名。

与现有 gate 的边界（不重复造）:
  | gate | 比较对象 | 抓什么 |
  |---|---|---|
  | ci.yml L51-57 verify-parallel --ci-pr | 本 PR 变更集 × 已合 PR 写集 | 两个 PR 撞同一批文件 |
  | 本 gate | 本 PR 变更集 × **本 PR 自己的声明** | 本 PR 里混入未声明文件（夹带） |
  两者正交，触发点同为 PR job。

声明源与权威顺序（S1 > S2 > S3，多源存在时取**并集**）:
  S1 `task-state/<D#>.json` 的 `write_set` 数组        —— 结构化，机器可读
  S2 dev doc `docs/plans/codex/implementation/SYNOVA-IMPL-*<D#>*.md` §写集表 —— 复用 devdoc_writeset.py
  S3 task brief `.claude/task-briefs/*<D#>*.md` 的 Q2「做什么」  —— 复用 brief_parser.py
  取并集的理由：三者都是**作者自己的声明**；用交集会把「在 A 声明、在 B 未列」当成夹带，
  属对声明语义的误读。被哪个源收录会在输出里逐条打印（可审计）。

契约（铁律 47）:
  @input   --base <ref>（缺省 origin/main） --head <ref>（缺省 HEAD） --branch <name>
           --pr-body <file>（可选；用于读取 PR 正文里的 `## 写集豁免`）
           --json（机器可读输出） --repo-root <path>
  @output  人读诊断块（夹带文件逐条点名 + 声明源 + 修复指引）或 JSON
  @exit    0 = 无夹带（含合法跳过） / 1 = 检测到夹带（业务阻断）
           2 = **无法判定**（取不到 diff / 无任何声明且变更不在文档范围 / 解析失败）
               —— 铁律 11：绝不静默放行为「通过」；D328 三态惯例。

豁免（**必须显式**，且逐条打印理由）:
  ① 分支级: `auto/**`（CI 自动生成的仪表盘分支）→ 整个 gate 跳过
  ② 路径级内置: `.claude/bypass.log`（每个提交都被 post-commit hook 追加的证据账本，
     与写集无关，属运行期产物）
  ③ 声明级: 声明文件里的 `## 写集豁免` 段落（每行 `- <路径> — <理由>`），无理由不生效
"""
import argparse
import shutil
import fnmatch
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# ── 内置豁免（路径级）。加条目必须附理由，且会在输出里打印 ──
BUILTIN_EXEMPT: Dict[str, str] = {
    ".claude/bypass.log": "post-commit hook 每次提交追加的证据账本（运行期产物，与写集无关）",
}
# 分支级跳过
#   auto/**  —— CI 自动生成的仪表盘分支（无写集语义）
#   main/master —— 合并后 push：本 gate 的触发点是**合并前**（PR job），
#                  合并后对账只能事后发现、且此时 PR 语义已消失 → 本 gate 不管这一格
SKIP_BRANCH_RE = re.compile(r"^(auto/|main$|master$)")
# 「无声明」时可降级放行的非源码范围（纯文档/流程产物）
DOC_SCOPE_RE = re.compile(
    r"^(docs/|\.claude/|memory/|task-state/|\.github/)|\.md$"
)


def python_bin() -> str:
    """跨平台 python 解释器解析（D520 / PLATFORM-CHECKLIST.md 的 PYBIN 惯例）。

    本脚本自身由 python 运行，此函数只用于**派生**子进程去调用同目录的解析器
    （devdoc_writeset.py / brief_parser.py）。Windows 上可能只有 `python` 或 `py -3`，
    故按 PYBIN 惯例逐级探测（见 PLATFORM-CHECKLIST.md / D520）；全不可用 → 回退 sys.executable。
    """
    if sys.executable:
        return sys.executable
    for cand in ("python3", "python", "py"):  # PYBIN 惯例（D520）
        p = shutil.which(cand)
        if p:
            return p
    return "python3"  # 兜底：交由 subprocess 抛错（GateError 包装，不静默）


class GateError(Exception):
    """gate 自身无法判定（→ exit 2，fail-closed）。"""


def run_git(args: List[str], cwd: str) -> str:
    try:
        p = subprocess.run(["git"] + args, cwd=cwd, capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError) as exc:
        raise GateError(f"git {' '.join(args)} 执行失败: {exc}") from exc
    if p.returncode != 0:
        raise GateError(f"git {' '.join(args)} 返回 {p.returncode}: {(p.stderr or '').strip()[:200]}")
    return p.stdout


def changed_files(repo: str, base: str, head: str) -> Tuple[str, List[str]]:
    """返回 (merge_base_sha, 变更路径列表)。取不到 → GateError（fail-closed）。"""
    mb = run_git(["merge-base", base, head], repo).strip()
    if not mb:
        raise GateError(f"merge-base({base}, {head}) 为空 — 无法计算变更集")
    # D339 同款: 必须关掉 core.quotepath，否则 CJK 文件名被转义成 "...\345\220..." 引号串
    # → 与声明条目永不匹配 → 中文名文件一律被误判夹带（本仓大量中文文档名）
    out = run_git(["-c", "core.quotepath=false", "diff", "--name-only", "--no-renames",
                   f"{mb}..{head}"], repo)
    files = [ln.strip() for ln in out.splitlines() if ln.strip()]
    return mb, files


def parse_did(text: str) -> Optional[str]:
    m = re.search(r"D\d+", text or "")
    return m.group(0) if m else None


def find_declaration_files(repo: str, did: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """按 S1/S2/S3 定位声明文件（task-state / dev doc / brief）。"""
    ts = dd = bf = None
    if did:
        cand = Path(repo) / "task-state" / f"{did}.json"
        if cand.exists():
            ts = str(cand)
        impl = Path(repo) / "docs" / "plans" / "codex" / "implementation"
        if impl.is_dir():
            hits = sorted(impl.glob(f"SYNOVA-IMPL-*{did}*.md"))
            if hits:
                dd = str(hits[-1])
    briefs = Path(repo) / ".claude" / "task-briefs"
    if briefs.is_dir():
        allb = sorted(briefs.glob("*.md"))
        if did:
            hits = [b for b in allb if did in b.name]
            if hits:
                bf = str(hits[-1])
    return ts, dd, bf


def _clean_entry(raw: str) -> str:
    """写集条目清洗: markdown 链接 / 反引号 / 计数括号 / 行号后缀 / 后置说明。"""
    s = raw.strip()
    m = re.match(r"^\[([^\]]+)\]\([^)]*\)$", s)          # [path](url)
    if m:
        s = m.group(1)
    s = s.strip("`").strip()
    s = re.sub(r"\s*[（(]\s*\d+\s*[^）)]*[）)]\s*$", "", s)   # (3 修改)
    s = re.sub(r"\s+L\d+\s*$", "", s)                        # path L750
    s = re.split(r"\s+[—–-]{1,2}\s+", s, 1)[0].strip()        # path — 说明
    s = s.strip("`").strip().rstrip("/")
    return s


def collect_declared(repo: str, ts: Optional[str], dd: Optional[str], bf: Optional[str]) -> Tuple[List[Tuple[str, str]], List[str]]:
    """返回 ([(条目, 来源)] , 告警列表)。源解析失败只记告警，不静默。"""
    entries: List[Tuple[str, str]] = []
    warns: List[str] = []

    if ts:
        try:
            data = json.loads(Path(ts).read_text(encoding="utf-8", errors="replace"))
            ws = data.get("write_set")
            if isinstance(ws, list):
                for e in ws:
                    if str(e).strip():
                        entries.append((_clean_entry(str(e)), "S1:task-state.write_set"))
        except (OSError, ValueError) as exc:
            warns.append(f"S1 解析失败({ts}): {exc}")

    if dd:
        py = python_bin()
        helper = Path(repo) / "scripts" / "control-tower" / "devdoc_writeset.py"
        try:
            p = subprocess.run([py, str(helper), "--extract", dd], capture_output=True,
                               text=True, encoding="utf-8", errors="replace", timeout=60)
            j = json.loads(p.stdout or "{}")
            for e in (j.get("cleaned") or []):
                if str(e).strip():
                    entries.append((_clean_entry(str(e)), "S2:devdoc.写集表"))
        except (OSError, subprocess.SubprocessError, ValueError) as exc:
            warns.append(f"S2 解析失败({dd}): {exc}")

    if bf:
        py = python_bin()
        bp = Path(repo) / "scripts" / "control-tower" / "brief_parser.py"
        try:
            p = subprocess.run([py, str(bp), "--q2-include", bf], capture_output=True,
                               text=True, encoding="utf-8", errors="replace", timeout=60)
            for ln in (p.stdout or "").splitlines():
                if ln.strip():
                    entries.append((_clean_entry(ln), "S3:brief.Q2-include"))
        except (OSError, subprocess.SubprocessError) as exc:
            warns.append(f"S3 解析失败({bf}): {exc}")

    # 去重（保留首个来源）
    seen = set()
    uniq: List[Tuple[str, str]] = []
    for e, src in entries:
        if e and e not in seen:
            seen.add(e)
            uniq.append((e, src))
    return uniq, warns


def collect_explicit_exempt(repo: str, ts: Optional[str], dd: Optional[str], bf: Optional[str]) -> List[Tuple[str, str]]:
    """声明文件里的 `## 写集豁免` 段落: 每行 `- <路径> — <理由>`；无理由不生效。"""
    out: List[Tuple[str, str]] = []
    for f in (ts, dd, bf):
        if not f:
            continue
        try:
            text = Path(f).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        in_sec = False
        for line in text.splitlines():
            if re.match(r"^#{2,4}\s*写集豁免", line):
                in_sec = True
                continue
            if in_sec and re.match(r"^#{1,4}\s", line):
                break
            if in_sec and line.strip().startswith("- "):
                body = line.strip()[2:]
                parts = re.split(r"\s+[—–-]{1,2}\s+", body, 1)
                if len(parts) == 2 and parts[1].strip():
                    out.append((_clean_entry(parts[0]), parts[1].strip()))
    return out


def matches(path: str, entry: str) -> bool:
    """声明条目匹配: 精确 / 目录前缀 / glob。"""
    if not entry:
        return False
    if path == entry:
        return True
    if path.startswith(entry + "/"):
        return True
    if any(c in entry for c in "*?["):
        return fnmatch.fnmatch(path, entry)
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--branch", default="")
    ap.add_argument("--repo-root", default="")
    ap.add_argument("--pr-body", default="")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    repo = args.repo_root or str(Path(__file__).resolve().parents[2])
    branch = args.branch
    if not branch:
        try:
            branch = run_git(["rev-parse", "--abbrev-ref", "HEAD"], repo).strip()
        except GateError:
            branch = ""

    result = {"component": "merge-writeset-gate", "status": "pass", "branch": branch,
              "base": args.base, "head": args.head, "declared": [], "smuggled": [],
              "exempt": [], "warns": [], "reason": ""}

    # ── 豁免①: 自动分支 ──
    if SKIP_BRANCH_RE.match(branch or ""):
        result["status"] = "skip"
        result["reason"] = (f"分支 {branch} 命中分支级豁免（auto/** 自动分支无写集语义；"
                            f"main/master 为合并后 push，本 gate 的触发点在合并前）")
        _emit(result, args.json)
        return 0

    try:
        mb, files = changed_files(repo, args.base, args.head)
    except GateError as exc:
        result["status"] = "degraded"
        result["reason"] = f"无法判定: {exc}"
        _emit(result, args.json)
        _log_degraded(repo, result["reason"])
        return 2

    result["merge_base"] = mb
    result["changed_count"] = len(files)
    if not files:
        result["status"] = "pass"
        result["reason"] = "变更集为空"
        _emit(result, args.json)
        return 0

    # ── D# 推断: 分支名优先，回退最近提交 scope ──
    did = parse_did(branch)
    if not did:
        try:
            did = parse_did(run_git(["log", "-1", "--format=%s", args.head], repo))
        except GateError:
            did = None
    result["task_id"] = did

    ts, dd, bf = find_declaration_files(repo, did)
    declared, warns = collect_declared(repo, ts, dd, bf)
    result["warns"].extend(warns)
    result["sources"] = {"task_state": ts, "dev_doc": dd, "brief": bf}

    explicit = collect_explicit_exempt(repo, ts, dd, bf)
    if args.pr_body and Path(args.pr_body).exists():
        try:
            text = Path(args.pr_body).read_text(encoding="utf-8", errors="replace")
            in_sec = False
            for line in text.splitlines():
                if re.match(r"^#{1,4}\s*写集豁免", line):
                    in_sec = True
                    continue
                if in_sec and re.match(r"^#{1,4}\s", line):
                    break
                if in_sec and line.strip().startswith("- "):
                    parts = re.split(r"\s+[—–-]{1,2}\s+", line.strip()[2:], 1)
                    if len(parts) == 2 and parts[1].strip():
                        explicit.append((_clean_entry(parts[0]), parts[1].strip() + "（PR 正文声明）"))
        except OSError as exc:
            result["warns"].append(f"pr-body 读取失败: {exc}")

    result["declared"] = [{"entry": e, "source": s} for e, s in declared]

    # ── 无声明: 文档范围降级放行；否则 fail-closed ──
    if not declared:
        non_doc = [f for f in files if not DOC_SCOPE_RE.search(f)]
        if non_doc:
            result["status"] = "degraded"
            result["reason"] = ("无任何写集声明（S1 task-state.write_set / S2 dev doc 写集表 / "
                                "S3 task brief Q2 三源皆空）且变更含源码文件 → fail-closed 阻断")
            result["smuggled"] = non_doc
            _emit(result, args.json)
            _log_degraded(repo, result["reason"])
            return 2
        result["status"] = "skip"
        result["reason"] = "无写集声明，但变更全在文档/流程范围（docs|.claude|memory|task-state|*.md）→ 降级放行"
        _emit(result, args.json)
        _log_degraded(repo, result["reason"])
        return 0

    # ── 逐文件判定 ──
    smuggled: List[str] = []
    exempted: List[dict] = []
    for f in files:
        if f in BUILTIN_EXEMPT:
            exempted.append({"file": f, "reason": BUILTIN_EXEMPT[f], "kind": "builtin"})
            continue
        hit = next(((e, s) for e, s in declared if matches(f, e)), None)
        if hit:
            continue
        ex = next(((p, r) for p, r in explicit if matches(f, p)), None)
        if ex:
            exempted.append({"file": f, "reason": ex[1], "kind": "declared"})
            continue
        smuggled.append(f)

    result["exempt"] = exempted
    result["smuggled"] = smuggled

    if smuggled:
        result["status"] = "block"
        result["reason"] = f"检测到 {len(smuggled)} 个写集外文件（夹带）"
        _emit(result, args.json)
        return 1

    result["status"] = "pass"
    result["reason"] = "提交文件集 ⊆ 声明写集（无夹带）"
    _emit(result, args.json)
    return 0


def _log_degraded(repo: str, reason: str) -> None:
    try:
        p = Path(repo) / ".codex" / "control-tower" / "logs" / "degraded-events.log"
        p.parent.mkdir(parents=True, exist_ok=True)
        import datetime
        ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
        with p.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"time": ts, "component": "merge-writeset-gate",
                                 "reason": reason}, ensure_ascii=False) + "\n")
    except OSError:
        pass  # swallow-ok: 降级日志写入失败不改变 gate 判定（判定已在上游完成）


def _emit(result: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False))
        return
    st = result["status"]
    icon = {"pass": "✅", "block": "❌", "skip": "⏭", "degraded": "⚠️"}.get(st, "?")
    print("── merge-writeset-gate (D708) 合并级写集对账 ──")
    print(f"{icon} 结论: {st} — {result.get('reason','')}")
    if result.get("task_id"):
        print(f"   任务: {result['task_id']} | 分支: {result.get('branch','')}")
    if "changed_count" in result:
        print(f"   变更集: {result['changed_count']} 个文件（merge-base {str(result.get('merge_base',''))[:8]}）")
    if result.get("declared"):
        print(f"   声明写集 {len(result['declared'])} 条（多源并集）:")
        for d in result["declared"]:
            print(f"     · {d['entry']}   ← {d['source']}")
    else:
        print("   声明写集: （空）")
    if result.get("exempt"):
        print(f"   豁免 {len(result['exempt'])} 条（显式，逐条打印理由）:")
        for e in result["exempt"]:
            print(f"     · {e['file']}   ← [{e['kind']}] {e['reason']}")
    if result.get("smuggled"):
        print(f"   夹带文件 {len(result['smuggled'])} 个（不匹配任何声明项）:")
        for f in result["smuggled"]:
            print(f"     - {f}")
        print("   修复指引（三选一，禁止静默忽略）:")
        print("     ① 把该文件加入声明（S1 task-state write_set / S2 dev doc 写集表 / S3 brief Q2）")
        print("     ② 从本 PR 移出该文件（它可能属于另一个任务）")
        print("     ③ 显式豁免: 在声明文件加 `## 写集豁免` 段落，每行 `- <路径> — <理由>`（无理由不生效）")
    for w in result.get("warns", []):
        print(f"   ⚠️  {w}")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except GateError as exc:  # 兜底: 未捕获的判定失败一律 fail-closed
        print(f"⚠️  merge-writeset-gate 无法判定: {exc}", file=sys.stderr)
        sys.exit(2)
