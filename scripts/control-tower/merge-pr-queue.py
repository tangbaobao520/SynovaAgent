#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""merge-pr-queue.py — 合并队列推进器（CTO 合并纪律机器化，D920）

来历: 2026-09-22 串行合并流水线 (/tmp/serialmerge.py) 在 PR #712 上卡死 22 轮（每轮 70s），
  根因两条（本次接手实测）:
    根因1 **工作树参数缺失/为空** → 脚本 cwd 落到主工作区 → 对 main 反复 `git merge origin/main`
          （永远 "Already up to date"）→ 误判「等 GitHub 重算」空转。日志物证: `#712 === 开始（工作树 ）===`。
    根因2 **DIRTY 判据混淆** —— GitHub `mergeable=false` 有两种成因：
          (a) 真冲突；(b) **合并性缓存过期**（base 停在旧 main；实测 #704：GitHub 判 dirty，
              本地 `git merge origin/main` rc=0 干净）。旧脚本对两者一律"等"，且不验证。
  修正:
    ① 工作树解析强校验 —— 缺失即 FAIL LOUD（绝不回落主工作区）；无现成工作树则显式新建并留痕。
    ② DIRTY 不再"等"：本地 `git merge-tree` 复验 —— 真冲突 → 报冲突文件清单并停；
       缓存过期 → 推一次 re-merge 强制 GitHub 重算（实测 #704 dirty→clean 生效）。
    ③ 失败 job 自动重跑（`rerun-failed-jobs`）—— 基线修复落地后让在途 PR 复绿的正路
       （PR check 跑在 merge ref 上，重跑即含新 main，无需改分支）。
    ④ 合并后立即同步主工作区（承重墙：创始人界面里的相对链接依赖它）。

契约 (铁律 47):
  @input  — --prs <n> [<n>...]（必填）；--repo <path>（默认 git root）
            --wait-merged <n>（可多次；先等这些 PR 合并 —— 基线修复未落地时推进别的是空转）
            --max-rounds <n>（每 PR 轮询上限，默认 60）/ --sleep <s>（默认 20）
            --dry-run（只分类不动作：不 merge / 不 push / 不 rerun）
            --fixture-classify <json> / --fixture-worktree <file>（密封测试注入缝，零网络）
  @output — 每 PR 一行状态日志（时间戳 + 状态 + 依据）；末行 `QUEUE-DONE all_ok=<bool>`
  @exit   — 0 = 全部目标达成（merged 或已 merged）；1 = 有目标未达成（冲突/失败/超时，明确列出）
            2 = 入参/环境错误（fail-closed：无 --prs / repo 非法 / fixture 不可读）
  @degraded — GitHub API 不可达 → 状态 ERR + 重试；超上限 → exit 1 并点名（不静默当作成功）
  @error  — 状态词汇: MERGED / READY / PEND / BAD / DIRTY_CONFLICT / DIRTY_STALE / UNKNOWN / CLOSED / ERR
  @cross_platform — D520: 本文件即 python 实现，无裸 python3 调用；纯标准库（无第三方依赖）；
                    UTF-8 强制；见 PLATFORM-CHECKLIST.md
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

try:  # D313 M5 UTF-8 强制（Windows 控制台）
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

API_BASE = "https://api.github.com/repos/tangbaobao520/SynovaAgent"
STATES = ("MERGED", "READY", "PEND", "BAD", "DIRTY_CONFLICT", "DIRTY_STALE",
          "UNKNOWN", "CLOSED", "ERR")


# ═══════════════════════════════════════════════════════════════════════
# 纯函数核心（零网络、零副作用 —— 密封测试直接注入夹具）
# ═══════════════════════════════════════════════════════════════════════
def classify(pr, check_runs):
    """PR 状态判定（根因2 修正：DIRTY 不再与"等待"混同）。

    @input  — pr: GitHub PR JSON（需 state/merged/mergeable/mergeable_state）
              check_runs: 该 head sha 的 check-runs 列表
    @output — (state, detail)；state ∈ STATES
    @degraded — mergeable 为 null（GitHub 仍在算）→ UNKNOWN（显式，绝不当作 READY）
    """
    if not isinstance(pr, dict) or "state" not in pr:
        return "ERR", "PR JSON 缺 state 字段"
    if pr.get("merged"):
        return "MERGED", "已合并"
    if pr.get("state") != "open":
        return "CLOSED", f"state={pr.get('state')}"
    bad = [r["name"] for r in (check_runs or [])
           if r.get("status") == "completed"
           and r.get("conclusion") not in ("success", "skipped", "neutral")]
    if bad:
        return "BAD", bad
    pend = [r["name"] for r in (check_runs or []) if r.get("status") != "completed"]
    if pend:
        return "PEND", pend
    if pr.get("mergeable") is True:
        return "READY", "CI 全绿 + mergeable=true"
    if pr.get("mergeable") is False:
        # 真冲突 vs 缓存过期 —— 由调用方用 local_merge_check 复验后再定（此处只给 DIRTY）
        return "DIRTY", f"mergeable_state={pr.get('mergeable_state')}"
    return "UNKNOWN", f"mergeable={pr.get('mergeable')}（GitHub 计算中）"


def conflict_files_from_mergetree(out):
    """从 `git merge-tree --write-tree --name-only` 输出提取冲突文件（无冲突 → []）。
    输出首行为结果树 sha；冲突行形如 `CONFLICT (content): Merge conflict in <path>`。"""
    files = []
    for line in (out or "").splitlines():
        m = re.match(r"CONFLICT \([^)]*\): .*? (?:in|at) (.+)$", line.strip())
        if m:
            files.append(m.group(1).strip())
        elif line.strip().startswith("CONFLICT"):
            files.append(line.strip())
    return files


def dir_dirty_kind(mergetree_out):
    """DIRTY 细分：有冲突 → ('DIRTY_CONFLICT', files)；否则 ('DIRTY_STALE', [])。"""
    files = conflict_files_from_mergetree(mergetree_out)
    return ("DIRTY_CONFLICT", files) if files else ("DIRTY_STALE", [])


def resolve_worktree(porcelain, branch, pr, repo):
    """工作树解析（根因1 修正：缺失即 FAIL LOUD，绝不回落主工作区）。

    @input  — porcelain: `git worktree list --porcelain` 输出；branch: PR head 分支名；
              pr: PR 号（新建工作树命名用）；repo: 仓库根
    @output — (path, err)：命中已有工作树 → (path, None)；未命中 → 约定新建路径 (path, None)
    @degraded — branch 为空 → (None, 原因)（调用方必须中止，不得使用主工作区）
    """
    if not branch or not branch.strip():
        return None, "PR head 分支名为空 — 拒绝解析工作树（根因1：绝不回落主工作区）"
    cur = None
    for line in (porcelain or "").splitlines():
        if line.startswith("worktree "):
            cur = line.split(" ", 1)[1].strip()
        elif line.startswith("branch ") and cur:
            ref = line.split(" ", 1)[1].strip().replace("refs/heads/", "")
            if ref == branch:
                return cur, None
        elif not line.strip():
            cur = None
    return os.path.join(repo, f".synova-wt-pr{pr}"), None


# ═══════════════════════════════════════════════════════════════════════
# 副作用层（网络 + git）
# ═══════════════════════════════════════════════════════════════════════
def _token():
    path = os.path.expanduser("~/.dsh/.credentials.yaml")
    try:
        m = re.search(r"GITHUB_TOKEN:\s*(\S+)", open(path, encoding="utf-8").read())
        return m.group(1) if m else ""
    except OSError:
        return ""


class Queue:
    def __init__(self, repo, dry_run=False, sleep=20):
        self.repo = repo
        self.dry = dry_run
        self.sleep = sleep
        self.token = _token()
        self.hdr = {"Authorization": "Bearer " + self.token, "Accept": "application/vnd.github+json"}

    def log(self, m):
        print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

    def api(self, path, method="GET", payload=None):
        if not self.token:
            return {"_err": 401, "_body": "无 GITHUB_TOKEN"}
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(API_BASE + path, data=data, headers=self.hdr, method=method)
        try:
            with urllib.request.urlopen(req, timeout=40) as f:
                return json.load(f)
        except urllib.error.HTTPError as e:
            return {"_err": e.code, "_body": e.read().decode()[:300]}
        except (urllib.error.URLError, TimeoutError) as e:
            return {"_err": 0, "_body": f"网络不可达: {e}"}

    def sh(self, cmd, cwd=None):
        p = subprocess.run(cmd, cwd=cwd or self.repo, capture_output=True, text=True)
        return p.returncode, (p.stdout or "") + (p.stderr or "")

    def state_of(self, n):
        pr = self.api(f"/pulls/{n}")
        if "_err" in pr:
            return "ERR", pr
        sha = pr.get("head", {}).get("sha", "")
        cr = self.api(f"/commits/{sha}/check-runs?per_page=100")
        return classify(pr, cr.get("check_runs", []) if isinstance(cr, dict) else [])

    def local_merge_check(self, branch):
        rc, out = self.sh(["git", "merge-tree", "--write-tree", "--name-only", "origin/main", f"origin/{branch}"])
        if rc != 0:
            return "DIRTY_CONFLICT", [f"<merge-tree 自身失败 rc={rc}: {out.strip()[:120]}>"]
        return dir_dirty_kind(out)

    def rerun_failed(self, n):
        pr = self.api(f"/pulls/{n}")
        sha = pr.get("head", {}).get("sha", "")
        runs = self.api(f"/actions/runs?head_sha={sha}&per_page=50").get("workflow_runs", [])
        hit = [r for r in runs if r.get("conclusion") in ("failure", "cancelled", "timed_out")]
        if not hit:
            self.log(f"#{n} 无失败 run 可重跑")
            return False
        for r in hit:
            if self.dry:
                self.log(f"#{n} [dry-run] 将重跑 run {r['id']}")
                continue
            res = self.api(f"/actions/runs/{r['id']}/rerun-failed-jobs", "POST", {})
            self.log(f"#{n} 重跑 run {r['id']}: {'ok' if '_err' not in res else res}")
        return True

    def promote(self, n, max_rounds):
        pr = self.api(f"/pulls/{n}")
        if "_err" in pr:
            self.log(f"#{n} ⛔ ERR: {pr}")
            return False
        branch = pr.get("head", {}).get("ref", "")
        porc = self.sh(["git", "worktree", "list", "--porcelain"])[1]
        wt, err = resolve_worktree(porc, branch, n, self.repo)
        if err:
            self.log(f"#{n} ❌ {err}")
            return False
        if not os.path.isdir(wt):
            if self.dry:
                self.log(f"#{n} [dry-run] 将新建工作树 {wt}")
            else:
                rc, out = self.sh(["git", "worktree", "add", wt, branch])
                if rc != 0:
                    self.log(f"#{n} ❌ 工作树创建失败: {out.strip()[-160:]}")
                    return False
                self.log(f"#{n} 新建工作树 {wt}（branch={branch}）")
        st, info = self.state_of(n)
        self.log(f"#{n} 起始状态 {st}（{info if not isinstance(info, list) else info}）")
        if st == "BAD":
            self.rerun_failed(n)
            time.sleep(self.sleep)
        for i in range(max_rounds):
            st, info = self.state_of(n)
            if st == "MERGED":
                self.log(f"#{n} ✅ 已合并（幂等跳过）")
                return True
            if st == "READY":
                if self.dry:
                    self.log(f"#{n} [dry-run] READY —— 将合并")
                    return True
                r = self.api(f"/pulls/{n}/merge", "PUT", {"merge_method": "merge"})
                if r.get("merged"):
                    self.log(f"#{n} ✅ MERGED sha={r.get('sha','')[:8]}")
                    self.sh(["git", "fetch", "-q", "origin"])
                    rc, o = self.sh(["git", "merge", "--ff-only", "origin/main"])
                    self.log(f"#{n} 主工作区同步: {'ok' if rc == 0 else o.strip()[-140:]}")
                    return True
                self.log(f"#{n} merge 未成: {r.get('message')}")
                time.sleep(self.sleep)
            elif st in ("BAD", "CLOSED", "ERR"):
                self.log(f"#{n} ⛔ {st}: {str(info)[:240]}")
                return False
            elif st == "DIRTY":
                kind, files = self.local_merge_check(branch)
                self.log(f"#{n} DIRTY → 本地复验: {kind} {files}")
                if kind == "DIRTY_CONFLICT":
                    self.log(f"#{n} ❌ 真冲突（不空转）— 冲突文件: {files}；需 CTO union 裁定")
                    return False
                # DIRTY_STALE: 缓存过期 → 推一次 re-merge 强制重算（实测生效）
                if self.dry:
                    self.log(f"#{n} [dry-run] 将 re-merge main 并推送以强制重算")
                    return False
                rc, out = self.sh(["git", "fetch", "-q", "origin"], wt)
                rc, out = self.sh(["git", "merge", "origin/main", "--no-edit"], wt)
                if rc != 0:
                    self.log(f"#{n} ❌ re-merge 失败: {out.strip()[-160:]}")
                    return False
                if "Already up to date" in out:
                    self.log(f"#{n} ⚠️ 本地已含 main 但 GitHub 仍判 dirty —— 需人工核（不空转）")
                    return False
                rc2, o2 = self.sh(["git", "push", "origin", branch], wt)
                self.log(f"#{n} re-merge → push {branch}: {'ok' if rc2 == 0 else o2.strip()[-160:]}")
                time.sleep(self.sleep)
            else:  # PEND / UNKNOWN
                if i % 4 == 0:
                    self.log(f"#{n} {st} ({len(info) if isinstance(info, list) else info})")
                time.sleep(self.sleep)
        self.log(f"#{n} ⏱ 轮询上限 {max_rounds} 轮未达 READY")
        return False


def main():
    ap = argparse.ArgumentParser(description="合并队列推进器（D920）")
    ap.add_argument("--prs", nargs="*", type=int, default=[])
    ap.add_argument("--repo", default="")
    ap.add_argument("--wait-merged", action="append", type=int, default=[])
    ap.add_argument("--max-rounds", type=int, default=60)
    ap.add_argument("--sleep", type=int, default=20)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--fixture-classify", default="")
    ap.add_argument("--fixture-worktree", default="")
    ap.add_argument("--fixture-branch", default="")
    args = ap.parse_args()

    # 密封测试注入缝（零网络）
    if args.fixture_classify:
        try:
            fx = json.load(open(args.fixture_classify, encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"degraded: fixture 不可读: {e}", file=sys.stderr)
            return 2
        st, detail = classify(fx.get("pr", {}), fx.get("check_runs", []))
        if "mergetree" in fx and st == "DIRTY":
            st, detail = dir_dirty_kind(fx["mergetree"])
        print(json.dumps({"state": st, "detail": detail}, ensure_ascii=False))
        return 0
    if args.fixture_worktree:
        try:
            porc = open(args.fixture_worktree, encoding="utf-8").read()
        except OSError as e:
            print(f"degraded: fixture 不可读: {e}", file=sys.stderr)
            return 2
        path, err = resolve_worktree(porc, args.fixture_branch, 999, "/tmp/fake-repo")
        print(json.dumps({"path": path, "error": err}, ensure_ascii=False))
        return 1 if err else 0

    repo = args.repo
    if not repo:
        rc, out = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                                 capture_output=True, text=True).returncode, ""
        repo = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                              capture_output=True, text=True).stdout.strip()
    if not repo or not os.path.isdir(repo):
        print("degraded: repo 不可解析（--repo 未给且非 git 仓库）— fail-closed", file=sys.stderr)
        return 2
    if not args.prs:
        print("用法: merge-pr-queue.py --prs <n> [<n>...] [--wait-merged <n>] [--dry-run]", file=sys.stderr)
        return 2

    q = Queue(repo, args.dry_run, args.sleep)
    for w in args.wait_merged:
        ok = False
        for _ in range(max(args.max_rounds, 60)):
            st, info = q.state_of(w)
            if st == "MERGED":
                q.log(f"#{w} ✅ 前置已合并")
                ok = True
                break
            q.log(f"#{w} 前置等待: {st}")
            time.sleep(args.sleep)
        if not ok:
            q.log(f"前置 #{w} 未在时限内合并 — 中止（避免在红基线上推进）")
            return 1

    all_ok = True
    for n in args.prs:
        q.log(f"#{n} === 开始 ===")
        if not q.promote(n, args.max_rounds):
            all_ok = False
    q.log(f"QUEUE-DONE all_ok={all_ok}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
