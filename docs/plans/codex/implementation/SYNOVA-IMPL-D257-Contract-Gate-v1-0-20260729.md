<!-- SYNOVA-IMPL-D257 v1.0 | 2026-07-29 | CT Graph v2 Phase 1-2 -->
# SynovaAgent -- D257 契约门禁接入网守 v1.0
> v2计划 §3.2: contract-archiver.py 提取契约, 但 pre-commit 从未调用门禁

## 代码验证
- contract-archiver.py: extract+validate 存在 ✅
- pre-commit-check.sh: 8组硬阻断, 无第9组契约检查 ❌
- .codex/contracts/: 目录存在, 合约JSON文件存在 ✅

## Q0-Q4
Q0: 契约门禁引擎从未被网守调用。Agent 产出是否匹配上游契约——无人检查。
Q2: 做——pre-commit-check.sh 新增第9组 "契约门禁": 读取 .codex/contracts/*.json → 比对 staged 文件与契约声明→不匹配阻断。不做——Edge ID语义验证(需NLP, 超出bash能力)。
Q3: git commit → pre-commit G9 扫描 staged 文件 → 比对 contract.json 中的产出声明 → 发现声明了但未staged → 阻断 → 显示差异
Q4: L1手动×2 (contracts目录为空→跳过; contracts存在+staged不匹配→阻断)

## 改动 (仅 pre-commit-check.sh +30行)

### pre-commit-check.sh — 新增第9组, 在G8后/结果前
```bash
# ═══ 组 9/9: 契约门禁 (铁律 47) ═══
echo -e "${CYAN}── 组 9/9: 契约门禁 ──${RESET}"
CONTRACT_DIR="$ROOT/.codex/contracts"
CONTRACT_FAIL=""
if [ -d "$CONTRACT_DIR" ] && [ "$(ls -A "$CONTRACT_DIR" 2>/dev/null)" ]; then
  for cf in "$CONTRACT_DIR"/*.json; do
    [ ! -f "$cf" ] && continue
    # 从 contract.json 提取声明产出文件列表
    DECLARED=$(python -c "import json;d=json.load(open('$cf'));items=d if isinstance(d,list) else [d];print('\n'.join([i.get('filePath','') for i in items if i.get('filePath')]))" 2>/dev/null || true)
    for df in $DECLARED; do
      [ -z "$df" ] && continue
      if ! echo "$STAGED_ALL" | grep -qF "$df"; then
        CONTRACT_FAIL="${CONTRACT_FAIL}  ${cf##*/}: 声明产出 $df — 未在暂存区\n"
      fi
    done
  done
fi
hard_check "契约门禁: 声明产出须在暂存区" "${CONTRACT_FAIL:-}"
```

## 测试 (L1手动×2)
| # | 测试 |
|---|------|
| 1 | contracts目录为空→G9跳过(不阻断) |
| 2 | contract声明了abc.ts但未staged→阻断+显示差异 |

## 完成标准
pre-commit新增第9组, contracts非空时强制比对。bash -n通过。
