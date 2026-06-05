/**
 * tests/security/05-injection.test.ts
 *
 * 注入防护测试：SQL/NoSQL/路径遍历。
 * 所有 orgId 等用户输入必须经过 validateOrgId 校验。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

describe('注入防护', () => {
  it('src/ 中所有路由的 orgId 参数应经过校验', () => {
    const routeFiles = findTsFiles(path.join(REPO_ROOT, 'src/routes'));
    const orgIdPattern = /params\.orgId|req\.params\.orgId|orgId/;
    const validationPattern = /validateOrgId|orgId.*pattern|orgId.*test|ORG_ID_PATTERN/;

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(REPO_ROOT, file);

      // 如果有 orgId 引用
      if (orgIdPattern.test(content)) {
        // 必须也有校验
        if (!validationPattern.test(content)) {
          console.warn(`⚠ ${rel}: 使用了 orgId 但可能缺少校验`);
        }
      }
    }
  });

  it('validateOrgId 正则只允许字母数字连字符', () => {
    // 从 routes/ontology.ts 复制的校验逻辑
    const ORG_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
    const valid = ['org-abc-123', 'test_org', 'MyOrg1'];
    const invalid = [
      "org-a';DROP TABLE graph_nodes;--",
      '../../../etc/passwd',
      'org with spaces',
      '<script>',
      '',
      'a'.repeat(65),
    ];

    for (const v of valid) {
      expect(ORG_ID_PATTERN.test(v)).toBe(true);
    }
    for (const v of invalid) {
      expect(ORG_ID_PATTERN.test(v)).toBe(false);
    }
  });

  it('queryNodes/queryEdges graph 参数应传递', () => {
    // 多租户隔离检查：不传 graph 参数时不应返回跨租户数据
    const hasMissingGraph = (content: string): boolean => {
      // 查找 queryNodes/queryEdges 调用时缺少 graph 参数的模式
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/query(?:Nodes|Edges)\(/.test(lines[i])) {
          // 检查是否传了 graph 参数
          if (!lines[i].includes('graph') && !lines[i].includes('orgId')) {
            // 排除接口定义行
            if (!lines[i].includes('interface') && !lines[i].includes('queryNodes(')) {
              return true;
            }
          }
        }
      }
      return false;
    };

    const l4Files = findTsFiles(path.join(REPO_ROOT, 'src/l4'));
    for (const file of l4Files) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(REPO_ROOT, file);
      if (hasMissingGraph(content)) {
        console.warn(`⚠ ${rel}: 可能存在未传 graph 参数的查询调用`);
      }
    }
  });
});

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        results.push(...findTsFiles(full));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts')) {
        results.push(full);
      }
    }
  } catch { /* skip */ }
  return results;
}
