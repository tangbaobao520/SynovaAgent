# Pull Request

## 铁律 0-2 验收清单 (Anthropic 工程标准)

>  每个模块 = spec → test → impl → wire → review → merge

### Step 1: Spec
- [ ] 接口签名已定义（≤ 50 行）
- [ ] 包含"接入点"字段：本模块被谁调用？在哪个生产文件中 import？

### Step 2: Test
- [ ] 每个 public 函数 ≥ 2 个测试用例 (happy + sad)
- [ ] 测试即规范——测试通过 = 功能完成

### Step 3: Impl
- [ ] 实现只对标 spec 和测试，不对标"感觉"
- [ ] `as any` 零新增（铁律 38）
- [ ] `catch {}` 均有 `log.warn/error` 或注释说明降级原因（铁律 11+24+31）
- [ ] 无 Mock/TODO/hardcoded 假数据（铁律 8）

### Step 4: Verify
- [ ] `npx tsc --noEmit` → 零错误
- [ ] `npx vitest run` → 全绿 + coverage 不降
- [ ] `npm run check:iron-laws` → 全部硬阻断通过

### Step 5: Wire Check
- [ ] 新函数/类名出现在生产入口文件中（`grep -rn "新函数名" src/`）
- [ ] 用户旅程：触发点 → 数据流 → 结果呈现 完整链路可走通

### Step 6: Integration
- [ ] 至少 1 个集成测试覆盖完整调用路径

## 变更说明

<!-- 简要描述此 PR 做了什么，用户会看到什么变化 -->

## 受影响的铁律

<!-- 关联的铁律编号，如 铁律 38 (as any)、铁律 8 (Mock) 等 -->
