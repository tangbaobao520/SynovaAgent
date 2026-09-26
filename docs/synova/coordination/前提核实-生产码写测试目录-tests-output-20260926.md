# 卡面前提核实报告：生产码写测试目录（`tests/output/**`）

- 日期：2026-09-26
- 执行：synova-squad-lead（专职小队队长）
- 卡面来源：CTO 派卡「新卡：生产码写测试目录（`tests/output/**`）」——**无任务号**（CTO 卡面自带 `D1021` 指向前置，非本卡号）
- 工作树：`.synova-wt-tests-output-probe`（分支 `chore/tests-output-probe`，base = `main` @ `ee721b0a`）
- **结论：退回（前提 P3 实测不成立 + 判据不可执行 + 判据无判别力/归因倒置）。开工前拦下，未写任何生产码。**

> 依据：队长第一条不可让渡「前提冻结——实测不成立 → 停，报 CTO 改卡/废卡」。
> 全部数字取自命令原始输出；判别性结论用**实跑夹具**取得，非 grep 静态推断（坑清单：禁 grep 型静态判据当验收）。

---

## 一、前提逐条实测

| # | CTO 卡面陈述 | 命令 | 输出摘要 | 判定 |
|---|---|---|---|---|
| P1 | `src/mvp-server.ts:190-191` → `fs.writeFileSync(\`tests/output/http-${jobId}.html\`, html)` | `sed -n '190,191p' src/mvp-server.ts` | `190: fs.mkdirSync('tests/output', { recursive: true });`<br>`191: fs.writeFileSync(\`tests/output/http-${jobId}.html\`, html);` | ✅ **成立** |
| P2 | `mvp-server.cjs:194` → `mkdirSync('tests/output')`（第二处写入方） | `sed -n '194,195p' mvp-server.cjs` | `194: try { fs.mkdirSync('tests/output', { recursive: true }); } catch(e) {}`<br>`195: fs.writeFileSync('tests/output/http-' + jobId + '.html', html);` | ✅ **成立** |
| P3 | **D1021 已加 `.gitignore:90`** | `git merge-base --is-ancestor 7f56872e HEAD`<br>`cat -n .gitignore`<br>`git show HEAD:.gitignore \| grep -n output` | `ANCESTOR=NO` ❌<br>main `.gitignore` **共 86 行**，全文**无** `tests/output` 规则（`grep-exit=1`） | ❌ **不成立** |

### P3 展开（为什么错）

```
$ git merge-base --is-ancestor 7f56872e HEAD && echo YES || echo NO
NO                                    # D1021 提交不是 main 的祖先

$ git log -5 --oneline -- .gitignore   # main 上 .gitignore 最近提交
b3fe10e8 2026-09-15 fix(D774): GS-05 D370 全角修复 + GS 证据目录 git 豁免（2/3） (#576)
...                                   # 不含 7f56872e

$ git ls-remote --heads origin | grep -i d1021
e92771f6cd6346caa42065d8e3893c13887676e6  refs/heads/chore/D1021-tests-output-evict

$ git rev-list --left-right --count main...origin/chore/D1021-tests-output-evict
0   2                                 # main 领先 0，D1021 分支领先 2 → 未合
```

D1021（`7f56872e`，2026-09-26）**只在分支 `chore/D1021-tests-output-evict`**，远端同名分支存在但**未合并入 main**。
main 现状：`git ls-files tests/output` = **3 个 tracked**，且三个 json **NOT-IGNORED**。

⇒ 卡面引用的"已加的 `.gitignore:90`"在 main 上**不存在**（铁律：不引用未落 main 的路径）。

---

## 二、额外两条卡面缺陷（比 P3 更要紧）

### 缺陷 A：判据不可执行——`mvp-server` 零测试

卡面判据原文：「跑一次 mvp-server 相关测试 ⇒ `git status` 干净」。**不存在这样的测试。**

```
$ git ls-files 'tests/**/*.test.ts' | wc -l
572
$ git ls-files 'tests/**/*.test.ts' | grep -i mvp
(空)
$ git grep -ln "mvp-server" -- tests/
(空)                                   # tests/ 下 0 个文件引用 mvp-server
$ git ls-files | grep -i mvp
mvp-server.cjs                         # 源文件
src/mvp-server.ts                      # 源文件（无对应测试）
```

⇒ 判据**无法执行**，也就无法自验。本卡若照卡面交付，K3 审计必然以"判据不可核"驳回。

### 缺陷 B：判据无判别力 + 归因倒置——已用实跑夹具坐实

卡面因果链原文：「它让"跑一次服务/测试 ⇒ 主树变脏"」。

**夹具 1（复刻 `src/mvp-server.ts:190-191` 写入路径，实跑于工作树）**：

```
$ git status --porcelain | wc -l          # 基线
0
$ node /tmp/probe-write.cjs               # mkdirSync('tests/output') + writeFileSync(`tests/output/http-${jobId}.html`)
WROTE tests/output/http-probe-1790393932289.html
$ git status --porcelain | wc -l          # 写入后
0                                         # ← 仍然干净
$ git check-ignore -v tests/output/http-probe-*.html
.gitignore:13:*.html    tests/output/http-probe-1790393932289.html
$ ls -la tests/output/ | tail -1
-rw-r--r--  1 wane  staff  46  Sep 26 11:38  http-probe-1790393932289.html   # 文件确实落盘
```

⇒ 写入**真实发生**（文件落盘 46 字节），**但 `git status` 纹丝不动**。
原因：`.gitignore:13` 的 `*.html`（**基线规则，与 D1021 无关**）早已覆盖 `tests/output/http-*.html`。

**夹具 2（复刻 `tests/expert-quality/layer2-judge.test.ts:380-381`，即真正的脏树来源）**：

```
$ node /tmp/probe-json.cjs
WROTE tests/output/expert-quality-cross-industry.json
$ git status --porcelain
 M tests/output/expert-quality-cross-industry.json      # ← 唯一脏树项
$ git check-ignore -v tests/output/expert-quality-cross-industry.json
(none)  → NOT-IGNORED（tracked 文件被改写 ⇒ 修改态）
```

**归因结论（倒置）**：

| 写入方 | 目标 | 是否脏 `git status` |
|---|---|---|
| `src/mvp-server.ts:190-191` | `tests/output/http-*.html` | ❌ **不脏**（`*.html` 已忽略） |
| `mvp-server.cjs:194-195` | `tests/output/http-*.html` | ❌ **不脏**（同上） |
| `tests/expert-quality/layer2-judge.test.ts:380-381` | `tests/output/expert-quality-cross-industry.json` | ✅ **脏**（tracked + not-ignored） |
| `tests/run-experts-real.ts:208-210` | `tests/output/expert-test-results.json` | ✅ **脏**（同上） |

⇒ 卡面把**不脏树的两处**（prod 码写 html）指为"让主树变脏"的元凶，而**真正脏树的两处**在 `tests/` 下、归 **D1021** 那一卡。
**判据"改完 ⇒ git status 干净"在改前就已满足 ⇒ 无判别力**（坑清单：「要有"删掉即报红"的判别性夹具」——本判据反面）。

探针产物已全部清理（`rm http-probe-*.html` + `git checkout -- <json>`），清理后 `git status` 计数 = **0**。

---

## 三、CTO 要求的前置项：`http-${jobId}.html` 的消费者是谁？

**答案：零程序化读取方。它是调试留痕，不是交付物。**

| 探查 | 命令 | 结果 |
|---|---|---|
| 是否存在读取方 | `git grep -n "readFileSync.*tests/output" -- .` | **0 处** |
| 文件名模式（`http-` + `.html`）全仓引用 | `git grep -n "http-'"` / `'http-"'` | **仅 1 处**——`mvp-server.cjs:195`（**写入**处本身） |
| 是否被 HTTP 静态托管 | `git grep -n "express.static"` | `src/server.ts:325` 只挂 `/app`；**无** `tests/output` 挂载 |
| 真实的用户可见交付路径 | `sed -n '55p;193,196p' src/mvp-server.ts` | `55: res.type('html').send(job.report!)`；`195: job.report = html;` |

⇒ HTTP 报告读的是**内存变量** `job.report`，与 `191` 行落盘的 `html` **是同一个变量**——
落盘那份**没有任何代码读它**。消费方为浏览器/用户下载的说法**不成立**；真实形态是"先有内存交付，额外多写了一份无人读的盘"。

附带真实代价（卡面未提）：`jobId` 每次不同 ⇒ `tests/output/http-*.html` **无清理逻辑、无限累积**（本次探针即为第 N 个）。

---

## 四、建议改卡方案（供 CTO 一次改对）

卡面自身的决策树是「零消费者 ⇒ 改写到临时目录 / `os.tmpdir()`」。前置已答（零消费者）⇒ **该分支成立**，设计问题真实存在，卡**不必废，须改判据**。

### 建议新判据（判别性 = 改前红 / 改后绿）

| # | 新判据 | 命令 | 改前 | 改后 |
|---|---|---|---|---|
| N1 | prod 码不再写 `tests/output` | `git grep -c "tests/output" -- src/ mvp-server.cjs` | **4**（ts 2 + cjs 2） | **0** |
| N2 | 消费者行为等价（报告仍可产出） | 起 `npm run mvp` → `POST /api/diagnosis/upload` → `GET` 报告路由返回 `text/html` | 绿 | 绿（**不回归**） |
| N3 | 不再往源码树写文件 | 跑一次报告生成后 `git status --porcelain` = 0 **且** `ls tests/output/http-*.html` 无新增 | 绿（因 `*.html` 兜底） | 绿 |
| N4 | 落盘路径可定位（若保留落盘） | `log.info` 输出实际路径；路径指向 `os.tmpdir()` 或 `data/` | — | 有 |

> 注意 **N3 改前即为绿**（`*.html` 兜底）⇒ N3 **单独不能当验收**，必须与 **N1** 配对使用。这一点若写进卡面，可避免下一张卡再犯同类错。

### 建议写集（两两不重叠，共 2 个生产文件）

| 文件 | 现状 | 处置 |
|---|---|---|
| `src/mvp-server.ts` | 190-191 写 `tests/output/http-${jobId}.html` | 改写到 `os.tmpdir()`（并 `log.info` 路径） |
| `mvp-server.cjs` | 194-195 同上 | 同上（**注意：与 ts 非同源**——`buildReport` 签名不同：ts `(data)` 单参 / cjs `(orgName,dims,covered,measOutput,expOutput)` 五参，**不是编译产物**，须分别改） |

**本卡不含** `tests/**` 与 `.gitignore`（真因归 D1021；若需，另开卡或并入 D1021）。

### 与 D1021 的依赖关系（须 CTO 排期决定）

D1021 已把两处**真脏树**写入方的产物出库（`.gitignore` += 4 行 + `git rm --cached` 3 文件），**但未落 main**。
若先合 D1021：主树脏树问题即消除，本卡只剩"设计问题"价值（prod 码写测试目录 + 无限累积）。
⇒ 两者**无写集重叠**（D1021 动 `.gitignore`/`tests/output/*.json`；本卡动 `src/mvp-server.ts`/`mvp-server.cjs`）⇒ **可并行**。
⇒ 建议顺序：D1021 先合（消除真脏树）→ 本卡改判据后开工（治设计问题）。

---

## 五、小队编制说明

**未组队、未派共享任务。** 原因：卡面在**前提核实阶段**即退回（前提冻结是第一道门），未进入 M2 写集分工阶段。
按「退回只约束该件」，未冻结任何并行任务。
自验独立性（M3）在本轮不适用（无编码产出）；本轮结论**全部由队长亲自实测**，可提请 CTO / K3 复核。

## 六、遗留清单

1. **本卡无任务号**——CTO 派卡未给号；`git log --all --grep=D1022` 为空（未占用）。请 CTO 分配或确认沿用。
2. P3 的前提错源为"引用了未落 main 的分支状态"。同类风险：卡面凡引用 `.gitignore:NN`、文件行号，**应注明 base commit**。建议纳入派单模板。
3. 工作树卫生：`git worktree list` 现存 **287** 个 `.synova-wt-*`（含大量历史残留）。非本卡范围，登记备查。
4. `tests/run-e2e-pipeline.cjs` 依 D1021 记录当前**不可运行**（`Cannot find module '../packages/engine-core/...'`）——未在本轮复核，登记备查。

## 七、回执

- 分支：`chore/tests-output-probe`
- base：`main` @ `ee721b0a`（`git merge-base --is-ancestor 7f56872e HEAD` = NO 的同一 HEAD）
- 本报告仅新增文档，**未改任何生产码 / 未碰 `scripts/audit/**` / 未写审计标准**。
