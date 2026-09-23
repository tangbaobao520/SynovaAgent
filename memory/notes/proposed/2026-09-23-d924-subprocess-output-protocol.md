---
状态: proposed
日期: 2026-09-23
决策: 子进程 stdout 只承载单一语义通道——负载与元数据必须结构化分流（curl -o + -w '%{...}'），禁止哨兵标记混流后字符串分割；该规则由可执行检查器 + ratchet 存量清单物理执行。
理由: 哨兵分割的正确性依赖"负载不含哨兵"这一**第三方可控**的假设。HTTP 响应体可合法包含任意字符串，含 `__STATUS__:`；实测旧形态下分割段数由 2 变 3，状态码被正文污染、正文被截断。这不是风格问题而是正确性缺陷，且**门禁抓不到**（语法合法、类型合法）——故必须机器化。
---

# 决策 Note — D924 子进程输出协议（禁哨兵混流 + 可执行检查器）

> 卡号 D924（`task-state/D924.json`，截至 2026-09-23T16:51+0800 状态 = `spec_done`）。
> 本 Note 按 `memory/notes/README.md`「四字段头契约」撰写（状态/日期/决策/理由四项必填）。
> 不写可选的 `任务:` 头字段，原因见下方「门禁张力」一节——**留证上报，非规避**。
>
> **门禁张力（留证，待 CTO 裁定）**：`scripts/control-tower/check-notes-lifecycle.sh` 把
> `task-state` 状态 ∈ {`impl_done`, `spec_done`} 判为"实现已落地"从而要求本 Note `git mv` 到
> `implemented/`；但 `memory/notes/README.md` 的「四态迁移语义」表规定 proposed → implemented
> 的门槛是状态 ∈ {`impl_done`, `audited`}。**D924 = `spec_done`，两条规则结论相反。**
> 本卡写集（派单件）指定落在 `proposed/`；K3 未审计前不宜自判迁移（改纪律者不得自判通过）。
> 故本 Note 留在 `proposed/`，并**不带**门禁可提取的 `任务:` 字段。实测命令与输出见
> `docs/synova/product-lines/evidence/D924-子进程输出协议-20260923.md` §遗留清单 L1。

## 触发场景

双盲评审交叉确认的活证据：`scripts/golden-scenarios/common/assert.ts:101-110`
用 `curl -w '\n__STATUS__:%{http_code}'` 把状态码混入 stdout，再 `stdout.split('__STATUS__:')` 还原。

## 机械证据（字节级）

探针返回 200 + 正文 `{"note":"__STATUS__:999","ok":true}`：

```
旧形态: parts.length = 3 ; status = '999","ok":true}' ; body = '{"note":"'
新形态: status = 200     ; body   = 完整正文
```

`parts.length = 3`（期望 2）是"响应体含哨兵即解析错乱"的机械指纹。

## 决策内容

1. **协议三条款**：P1 stdout 单语义通道；P2 负载/元数据分流（`-o` 文件 / 独立 fd）；P3 禁哨兵混流后分割。
2. **检查器** `scripts/control-tower/check-subprocess-protocol.sh`：R1 哨兵混流 + R2 哨兵分割解析，
   显式排除 here-string 与已分流 `-o` 行；三态退出码 0/1/2（2 = fail-closed）。
3. **ratchet 存量清单**：建为**空清单**（存量 0），机制保留，新增即拦。
4. **最小修复** `assert.ts`：仅 `:101` 调用点 + `:109` 解析点（+1 行 `os` import，Windows 兼容需 `os.tmpdir()`），
   该文件其余部分未动。**保留**旧形态 body 末尾 `+1 LF` 的对外语义（字节级兼容，失效条件写在规范 §5）。

## 依据（参考系，K3 可核）

- 第一性原理：一个流 = 一个语义通道；混合通道的分割解析必然依赖对端内容假设。
- Anthropic 工程基线：契约优先（先规范后实现）+ 三态退出码（fail-closed，不与通过混同）。
- 开源实证：curl 官方即提供 `-o <file>` + `-w '%{...}'` 的结构化分流原语。
- 本地实证：`git grep` 实测排除面承重（`.sh`+`.ts` 口径同行兼含 `-o` 与 `-w` 者 27 行，不排除即 27 处误报）。

## 反例防复发（判别性设计，非空洞 grep）

夹具含**变异体判别**：把 R1 主判据改坏 → 同一违规样例必须**漏判**；把 EX2 排除面改坏 →
同一豁免样例必须**报红**。二者同时成立才证明判据承重。

## 已知边界与失效条件

见 `docs/synova/coordination/规范-子进程输出协议-20260923.md` §8：
哨兵形态变化 / 非 curl 子进程 / 新增扩展名 / EX2 过宽 / 全局归档——各自给出扩展动作。
