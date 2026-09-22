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

  **D911-A2（2026-09-22）**：三个源一律从**被检查的 head 树**读（`git show <head>:<path>`），
  不再读本地工作树 —— 否则「工作树不在该 PR 分支上」时（CI 检出 / 复核用别的 worktree）
  读到的是**别人的**声明文件，对账结论随运行目录漂移。S2/S3 的外部解析器只吃路径，
  故把 head 树内容落到**系统临时目录**的临时文件再喂它（不写进仓库；清理失败不改判定）。

D# 推断（D911-A1，2026-09-22）:
  分支名含 `[Dd]\d+` → 直接取；分支名无 D# → subject 回退**只扫 `merge-base(base,head)..head`**。
  并入的 main 历史（`git merge origin/main` 带入的提交）**不得提供 D#** —— 否则本 PR 被错锚到
  别人的任务号，拿别人的写集当声明源，自己的交付文件全判「夹带」（#674/#675/#685 实测）。
  范围内扫不到 → 返回 `None`，走既有「无声明 → 文档范围降级 / fail-closed」路径，**绝不猜号**。

契约（铁律 47）:
  @input   --base <ref>（缺省 origin/main） --head <ref>（缺省 HEAD） --branch <name>
           --pr-body <file>（可选；用于读取 PR 正文里的 `## 写集豁免`）
           --json（机器可读输出） --repo-root <path>
  @output  人读诊断块（夹带文件逐条点名 + 声明源 + 豁免通道状态 + 修复指引）或 JSON
  @exit    0 = 无夹带（含合法跳过） / 1 = 检测到夹带（业务阻断）
           2 = **无法判定**（取不到 diff / 无任何声明且变更不在文档范围 / head 树读取失败 / 解析失败）
               —— 铁律 11：绝不静默放行为「通过」；D328 三态惯例。
  @degraded JSON 的 `exempt_channel` = 结论字段（D911-A3）: `--pr-body` 缺失且 `GITHUB_EVENT_PATH`
           缺失时，PR 正文豁免通道不可用，必须显式进结论块（不得只留 warns 尾注），
           且修复指引给出不依赖 PR 正文的替代路径（声明文件内 `## 写集豁免`）。
           该状态**不改变退出码语义**，也不放行任何文件。

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
import tempfile
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

# ── D911-A3: 豁免通道状态 = **结论字段**（不是 warns 尾注） ──
#   背景: CI 只传 `--branch`，不传 `--pr-body` → PR 正文里的 `## 写集豁免` 在 CI 形同虚设。
#   本件**不改 ci.yml**（单写者）：改为把该状态显式打进结论块 + `--json` 字段，
#   并给出不依赖 PR 正文的替代路径（声明文件内 `## 写集豁免`，S1/S2/S3 任一）。
PR_BODY_UNAVAILABLE_REASON = "PR 正文不可用（--pr-body 未给且无 GITHUB_EVENT_PATH）"
EXEMPT_CHANNEL_FIX = ("改用声明文件内 `## 写集豁免`（S1 task-state / S2 dev doc / S3 brief "
                      "任一文件内该段落；不依赖 PR 正文）")
# 声明源在 JSON 里的键名（保持既有契约不变）
DECL_SOURCE_KEYS = (("S1", "task_state"), ("S2", "dev_doc"), ("S3", "brief"))


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


# ── D911-A2: 声明源一律从**被检查的 head 树**读 ──
#   为什么不用本地工作树：CI 在 PR 的 merge 检出上跑、复核用 `/private/tmp/wNNN` 的另一个 worktree，
#   而 `--head` 可能是 `origin/<branch>`。读本地工作树 = 读**当前目录恰好检出的那份**声明，
#   与「被检查的 head」不是同一棵树 → 对账结论随运行目录漂移（A2 缺陷）。
def _head_tree_files(repo: str, head: str, path_prefix: str) -> List[str]:
    """列出 head 树内 `path_prefix` 下的全部文件路径（'/' 分隔）。

    契约:
      @input  — repo / head（ref 或 sha）/ path_prefix（树内目录，如 `.claude/task-briefs`）
      @output — 文件路径列表（已排序；head 树里无该目录 → 空列表）
      @degraded — 枚举失败（head 非法 / git 不可用）→ 抛 GateError（**不静默当「无声明」**：
                  调用方 fail-closed exit 2，绝不因读取失败而放行）
    """
    # core.quotepath=false: CJK 文件名不得被转义（否则名称匹配永不命中）
    out = run_git(["-c", "core.quotepath=false", "ls-tree", "-r", "--name-only",
                   head, "--", path_prefix], repo)
    return sorted(ln.strip() for ln in out.splitlines() if ln.strip())


def _head_file_text(repo: str, head: str, path: str) -> Optional[str]:
    """读 head 树内单个文件的内容（`git show <head>:<path>`）。

    契约:
      @input  — repo / head / path（树内路径，'/' 分隔）
      @output — 文件内容（UTF-8，errors=replace）；**文件不在该树 → None**
      @degraded — 文件不存在 = 正常默认（ENOENT 语义，铁律 24）→ None，不告警、不抛错
      @error  — 不抛错（git 执行失败一律按「取不到该源」处理，由调用方按无声明路径判定）
    """
    try:
        p = subprocess.run(["git", "show", f"{head}:{path}"], cwd=repo, capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    if p.returncode != 0:
        return None  # ENOENT: 该源在 head 树里不存在
    return p.stdout


def _write_temp_text(content: str, suffix: str) -> Optional[str]:
    """把 head 树内容落到**系统临时目录**的文件（外部解析器只吃路径）。返回路径；失败 → None。

    契约:
      @input  — content（head 树内容）/ suffix（如 '.md'，供解析器按名识别）
      @output — 临时文件绝对路径；创建失败 → None（调用方记 warn，不改变判定方向）
      @degraded — 临时目录不可写 → None + 调用方 warn（不写进仓库；清理失败亦不改变判定）
    """
    try:
        fd, path = tempfile.mkstemp(prefix="d708-decl-", suffix=suffix)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
        return path
    except OSError:
        return None


def _drop_temp_text(path: Optional[str]) -> None:
    """清理临时文件；失败不影响判定（判定已在调用方完成）。"""
    if not path:
        return
    try:
        os.unlink(path)
    except OSError:
        pass  # swallow-ok: 临时文件清理失败不改变 gate 判定（判定已在上游完成）


def _tree_direct_children(repo: str, head: str, prefix: str) -> List[str]:
    """列出 head 树内 `prefix` 目录的**直接子文件**路径（不含更深层）。

    契约:
      @input  — repo / head / prefix（树内目录，无尾斜杠）
      @output — 直接子文件路径列表（已排序）；目录不存在 → 空列表
      @degraded — 枚举失败 → GateError（同 _head_tree_files，不静默当「无声明」）
    """
    head_mark = prefix + "/"
    return [p for p in _head_tree_files(repo, head, prefix)
            if p.startswith(head_mark) and "/" not in p[len(head_mark):]]


# D708 复核修复①: 大小写不敏感。分支名/提交 scope 常见小写（feat/win-d702-…、docs(d702): …），
#   旧实现只认大写 D → 推断为空 → 回退链失守（复核实测 parse_did('feat/win-d702-…') → None）。
#   统一归一化为大写，保证与 task-state / brief 文件名里的 D# 口径一致。
DID_RE = re.compile(r"[Dd]\d+")

# D708 复核修复②: post-commit hook 生成「登记影子提交」，其 subject 含 `bypass COMMITTED 登记`
#   且**带一个历史 D#**（如 `(auto hook, D521)`）。HEAD 经常就是这个影子提交 →
#   旧回退链直接读 `git log -1` 会把写集错配到 D521（复核实测确认）。
#   故回退时向前遍历，跳过登记提交，取第一个带 D# 的非登记提交。
REGISTRATION_SUBJECT_RE = re.compile(r"bypass COMMITTED 登记")
FALLBACK_SCAN_DEPTH = 20


def parse_did(text: str) -> Optional[str]:
    m = DID_RE.search(text or "")
    return m.group(0).upper() if m else None


def infer_did(repo: str, branch: str, head: str, base_ref: str = "") -> Tuple[Optional[str], str]:
    """推断任务 D#。返回 (D#|None, 来源)。来源用于诊断输出（可审计）。

    顺序: ① 分支名 → ② subject 回退，**范围限定 `merge-base(base_ref, head)..head`**
    （跳过自动登记影子提交）。范围外（如 `git merge origin/main` 并入的 main 历史）不取号。

    契约（铁律 47）:
      @input  — repo / branch（分支名，最高优先级）/ head（被检查的 ref 或 sha）
                base_ref（目标基线 ref/sha，如 origin/main）。**base_ref 缺失 → 不做 subject 回退**
                （无范围的回退正是缺陷① 越界取号本身）
      @output — (D#|None, 来源 ∈ {"branch", "commit-subject", "none"})
      @degraded — merge-base / git log 失败 → (None, "none")（**绝不猜号**：宁让上游走
                「无声明 → 文档范围降级 / fail-closed」，不取越界号）
      @error  — 不抛错（变更集判定已在 main() 用同一 base 先行完成；此处失败只降级为 None）
    """
    d = parse_did(branch or "")
    if d:
        return d, "branch"
    if not base_ref:
        return None, "none"
    try:
        mb = run_git(["merge-base", base_ref, head], repo).strip()
        if not mb:
            return None, "none"
        out = run_git(["log", f"--max-count={FALLBACK_SCAN_DEPTH}", "--format=%s",
                       f"{mb}..{head}"], repo)
    except GateError:
        return None, "none"
    for subj in out.splitlines():
        subj = subj.strip()
        if not subj or REGISTRATION_SUBJECT_RE.search(subj):
            continue
        d = parse_did(subj)
        if d:
            return d, "commit-subject"
    return None, "none"


def find_declaration_files(repo: str, did: Optional[str],
                           head: str) -> Dict[str, Optional[Dict[str, Optional[str]]]]:
    """按 S1/S2/S3 定位声明文件 —— **从被检查的 head 树读**（D911-A2）。

    返回 {"S1": {"path","content"}|None, "S2": ..., "S3": ...}；path = 树内路径（诊断输出用），
    content = head 树内容（None 表示该源在 head 树里不存在）。选取口径与旧实现逐条一致：
    S1 `task-state/<D#>.json`；S2 `docs/plans/codex/implementation/SYNOVA-IMPL-*<D#>*.md` 排序取末；
    S3 `.claude/task-briefs/*.md`（仅顶层）中文件名含 D# 者排序取末。did 为 None → 三源皆 None。

    契约（铁律 47）:
      @input  — repo / did（可为 None）/ head（被检查的 ref 或 sha）
      @output — 上述 dict（键固定为 S1/S2/S3，与既有 JSON `sources` 键一一对应）
      @degraded — head 树枚举失败（git ls-tree 失败）→ 抛 GateError（调用方 fail-closed exit 2）
      @error  — GateError（**不静默降级为「无声明」**：那会把门禁从 fail-closed 变成软放行）
    """
    empty: Dict[str, Optional[Dict[str, Optional[str]]]] = {"S1": None, "S2": None, "S3": None}
    if not did:
        return empty

    def src(path: str, content: Optional[str]) -> Optional[Dict[str, Optional[str]]]:
        return None if content is None else {"path": path, "content": content}

    # S1: task-state/<D#>.json
    s1_path = f"task-state/{did}.json"
    empty["S1"] = src(s1_path, _head_file_text(repo, head, s1_path))

    # S2: dev doc 写集表（与 Path.glob("SYNOVA-IMPL-*<D#>*.md") 同口径：按文件名匹配 + 排序取末）
    impl_prefix = "docs/plans/codex/implementation"
    impl_hits = [p for p in _tree_direct_children(repo, head, impl_prefix)
                 if fnmatch.fnmatch(p.rsplit("/", 1)[-1], f"SYNOVA-IMPL-*{did}*.md")]
    if impl_hits:
        s2_path = sorted(impl_hits)[-1]
        empty["S2"] = src(s2_path, _head_file_text(repo, head, s2_path))

    # S3: task brief（仅顶层 *.md，与 Path.glob("*.md") 同口径）
    brief_prefix = ".claude/task-briefs"
    brief_hits = [p for p in _tree_direct_children(repo, head, brief_prefix)
                  if p.endswith(".md") and did in p.rsplit("/", 1)[-1]]
    if brief_hits:
        s3_path = sorted(brief_hits)[-1]
        empty["S3"] = src(s3_path, _head_file_text(repo, head, s3_path))
    return empty


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


def collect_declared(repo: str,
                     sources: Dict[str, Optional[Dict[str, Optional[str]]]]) -> Tuple[List[Tuple[str, str]], List[str]]:
    """从 head 树内容收集声明写集（S1/S2/S3 并集）。返回 ([(条目, 来源)], 告警列表)。

    契约（铁律 47）:
      @input  — repo（外部解析器路径按它拼）/ sources（find_declaration_files 的产物，内容已在手）
      @output — ([(条目, 来源)] 去重保序, 告警列表)；S1/S2/S3 解析口径与并集语义**不变**
      @degraded — 单源解析失败 → 只记 warn（不静默、也不因此丢弃其他源）
      @error  — 不抛错
    """
    entries: List[Tuple[str, str]] = []
    warns: List[str] = []

    s1 = sources.get("S1")
    if s1:
        try:
            data = json.loads(s1.get("content") or "")
            ws = data.get("write_set")
            if isinstance(ws, list):
                for e in ws:
                    if str(e).strip():
                        entries.append((_clean_entry(str(e)), "S1:task-state.write_set"))
        except (OSError, ValueError) as exc:
            warns.append(f"S1 解析失败({s1.get('path')}): {exc}")

    # S2/S3: 外部解析器只吃**路径** → 先把 head 树内容落到系统临时目录再喂（临时文件不写进仓库）
    s2 = sources.get("S2")
    if s2:
        tmp = _write_temp_text(s2.get("content") or "", ".md")
        if tmp is None:
            warns.append(f"S2 解析失败({s2.get('path')}): 临时文件创建失败（head 树内容无法喂给解析器）")
        else:
            py = python_bin()
            helper = Path(repo) / "scripts" / "control-tower" / "devdoc_writeset.py"
            try:
                p = subprocess.run([py, str(helper), "--extract", tmp], capture_output=True,
                                   text=True, encoding="utf-8", errors="replace", timeout=60)
                j = json.loads(p.stdout or "{}")
                for e in (j.get("cleaned") or []):
                    if str(e).strip():
                        entries.append((_clean_entry(str(e)), "S2:devdoc.写集表"))
            except (OSError, subprocess.SubprocessError, ValueError) as exc:
                warns.append(f"S2 解析失败({s2.get('path')}): {exc}")
            finally:
                _drop_temp_text(tmp)

    s3 = sources.get("S3")
    if s3:
        tmp = _write_temp_text(s3.get("content") or "", ".md")
        if tmp is None:
            warns.append(f"S3 解析失败({s3.get('path')}): 临时文件创建失败（head 树内容无法喂给解析器）")
        else:
            py = python_bin()
            bp = Path(repo) / "scripts" / "control-tower" / "brief_parser.py"
            try:
                p = subprocess.run([py, str(bp), "--q2-include", tmp], capture_output=True,
                                   text=True, encoding="utf-8", errors="replace", timeout=60)
                for ln in (p.stdout or "").splitlines():
                    if ln.strip():
                        entries.append((_clean_entry(ln), "S3:brief.Q2-include"))
            except (OSError, subprocess.SubprocessError) as exc:
                warns.append(f"S3 解析失败({s3.get('path')}): {exc}")
            finally:
                _drop_temp_text(tmp)

    # 去重（保留首个来源）
    seen = set()
    uniq: List[Tuple[str, str]] = []
    for e, src in entries:
        if e and e not in seen:
            seen.add(e)
            uniq.append((e, src))
    return uniq, warns


EXEMPT_HEADING_RE = re.compile(r"^#{2,4}\s*写集豁免")


def scan_exempt_section(text: str, source: str) -> List[Tuple[str, str]]:
    """从任意文本里扫 `## 写集豁免` 段落: 每行 `- <路径> — <理由>`。无理由不生效。"""
    out: List[Tuple[str, str]] = []
    in_sec = False
    for line in (text or "").splitlines():
        if EXEMPT_HEADING_RE.match(line):
            in_sec = True
            continue
        if in_sec and re.match(r"^#{1,4}\s", line):
            break
        if in_sec and line.strip().startswith("- "):
            parts = re.split(r"\s+[—–-]{1,2}\s+", line.strip()[2:], 1)
            if len(parts) == 2 and parts[1].strip():
                reason = parts[1].strip() + ("（PR 正文声明）" if source == "pr-body" else "")
                out.append((_clean_entry(parts[0]), reason))
    return out


def collect_explicit_exempt(repo: str,
                            sources: Dict[str, Optional[Dict[str, Optional[str]]]]) -> List[Tuple[str, str]]:
    """声明文件里的 `## 写集豁免` 段落（多源取并）—— 内容取自 head 树（D911-A2）。

    契约:
      @input  — sources（find_declaration_files 的产物）
      @output — [(路径, 理由)]；无该段落 → 空列表（正常默认）
      @degraded — 单源无内容 → 跳过（不抛错）
      @error  — 不抛错
    """
    out: List[Tuple[str, str]] = []
    for key in ("S1", "S2", "S3"):
        s = sources.get(key)
        if not s or s.get("content") is None:
            continue
        out.extend(scan_exempt_section(s.get("content") or "", "file"))
    return out


def resolve_pr_body_text(arg_path: str) -> Tuple[str, str]:
    """PR 正文来源: ① 显式 --pr-body <file> ② CI 的 GITHUB_EVENT_PATH（pull_request 事件体）。

    D708 复核建议（非阻塞）: ci.yml 此前只传了 --branch，未接 --pr-body → PR 正文里的
    `## 写集豁免` 声明形同虚设。此处自取事件体，**无需改 ci.yml**，也让本地可注入测试。

    D911-A3: 返回值补第二项**通道状态**，让调用方能把「豁免通道不可用」升级为**结论字段**
    （此前只能落到 warns 尾注 → 执行方看不到「PR 正文里的豁免根本没被读」这件事）。

    契约（铁律 47）:
      @input  — arg_path（`--pr-body` 值，可空）
      @output — (正文文本, 通道状态)；状态 ∈ {"--pr-body", "GITHUB_EVENT_PATH", "empty", "unavailable"}
                "unavailable" = 两个通道都取不到（含 `--pr-body` 给了但读不出）→ 调用方必须
                把该状态打进结论块 + JSON，并给出替代路径（声明文件内 `## 写集豁免`）
      @degraded — 读取/解析失败 → ("", "unavailable")（**不放行任何文件、不改退出码语义**）
      @error  — 不抛错
    """
    if arg_path:
        try:
            return Path(arg_path).read_text(encoding="utf-8", errors="replace"), "--pr-body"
        except OSError:
            return "", "unavailable"  # 给了路径但读不出 = 通道不可用（不当作「无豁免」静默放过）
    ev = os.environ.get("GITHUB_EVENT_PATH", "")
    if not ev or not os.path.exists(ev):
        return "", "unavailable"
    try:
        data = json.loads(Path(ev).read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        return "", "unavailable"
    body = ((data.get("pull_request") or {}).get("body") or "")
    return body, ("GITHUB_EVENT_PATH" if body else "empty")


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

    # ── D# 推断: 分支名优先；回退**只扫 merge-base(base,head)..head**（D911-A1）──
    did, did_src = infer_did(repo, branch, args.head, args.base)
    result["task_id"] = did
    result["task_id_source"] = did_src

    # ── 声明源: 从**被检查的 head 树**读（D911-A2）；head 树读不出 → fail-closed ──
    try:
        sources = find_declaration_files(repo, did, args.head)
    except GateError as exc:
        result["status"] = "degraded"
        result["reason"] = f"无法判定: head 树声明源读取失败 — {exc}"
        _emit(result, args.json)
        _log_degraded(repo, result["reason"])
        return 2
    declared, warns = collect_declared(repo, sources)
    result["warns"].extend(warns)
    result["sources"] = {json_key: (sources.get(k) or {}).get("path")
                         for k, json_key in DECL_SOURCE_KEYS}
    result["sources_from"] = f"head tree @ {args.head}"

    explicit = collect_explicit_exempt(repo, sources)
    pr_text, pr_channel = resolve_pr_body_text(args.pr_body)
    result["pr_body_channel"] = pr_channel
    if pr_text:
        explicit.extend(scan_exempt_section(pr_text, "pr-body"))
    if pr_channel == "unavailable":
        # D911-A3: 结论字段（不只 warns 尾注）——执行方必须看到「PR 正文豁免通道不可用」，
        #   并拿到不依赖 PR 正文的替代路径。**退出码语义与放行判定完全不变。**
        result["exempt_channel"] = "unavailable"
        result["exempt_channel_reason"] = PR_BODY_UNAVAILABLE_REASON
        result["exempt_channel_fix"] = EXEMPT_CHANNEL_FIX
    else:
        result["exempt_channel"] = pr_channel

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


def _emit_exempt_channel(result: dict) -> None:
    """D911-A3: 「豁免通道不可用」是**结论字段**（打印在结论块内），不是 warns 尾注。

    契约:
      @input  — result（含 exempt_channel / reason / fix）
      @output — 结论块内的 1-2 行状态打印；状态缺失 → 不打印（早期返回路径无豁免语义）
      @degraded — 通道不可用 → `⚠️` 显式打印（铁律 11：绝不静默）+ 替代路径
      @error  — 不抛错
    """
    chan = result.get("exempt_channel")
    if not chan:
        return
    if chan == "unavailable":
        print(f"   ⚠️ 豁免通道: 不可用 — {result.get('exempt_channel_reason', PR_BODY_UNAVAILABLE_REASON)}")
        print(f"      修复指引: {result.get('exempt_channel_fix', EXEMPT_CHANNEL_FIX)}")
    elif chan == "empty":
        print("   ℹ️ 豁免通道: 可用但 PR 正文为空（无可读豁免声明）")


def _emit(result: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False))
        return
    st = result["status"]
    icon = {"pass": "✅", "block": "❌", "skip": "⏭", "degraded": "⚠️"}.get(st, "?")
    print("── merge-writeset-gate (D708) 合并级写集对账 ──")
    print(f"{icon} 结论: {st} — {result.get('reason','')}")
    _emit_exempt_channel(result)  # D911-A3: 豁免通道状态进结论块
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
        if result.get("exempt_channel") == "unavailable":
            # D911-A3: 通道不可用时必须指向**不依赖 PR 正文**的那条路
            print("     ③ 显式豁免: **改用声明文件内 `## 写集豁免`** 段落，每行 `- <路径> — <理由>`"
                  "（无理由不生效）")
            print("        （PR 正文豁免通道不可用 → 见上方「豁免通道」结论字段）")
            paste_hint = "（补全理由后放入**声明文件**（S1/S2/S3 任一）内 `## 写集豁免`；PR 正文通道不可用）"
        else:
            print("     ③ 显式豁免: 在 PR 正文/声明文件加 `## 写集豁免` 段落，每行 `- <路径> — <理由>`（无理由不生效）")
            paste_hint = "（补全理由后放入 PR 正文 `## 写集豁免`）"
        print("     ⚠ 豁免/声明条目必须逐条**精确路径**（或 `<dir>/**` glob）——")
        print("        模糊描述（如「相关脚本」「治理文档若干」）不被匹配，直接判夹带。")
        print(f"     可直接粘贴的精确豁免行{paste_hint}:")
        for f in result["smuggled"]:
            print(f"       - {f} — <理由：为何此文件属于本任务>")
    for w in result.get("warns", []):
        print(f"   ⚠️  {w}")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except GateError as exc:  # 兜底: 未捕获的判定失败一律 fail-closed
        print(f"⚠️  merge-writeset-gate 无法判定: {exc}", file=sys.stderr)
        sys.exit(2)
