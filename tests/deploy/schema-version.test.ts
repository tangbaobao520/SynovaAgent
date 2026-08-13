/**
 * tests/deploy/schema-version.test.ts — D48 Schema 版本管理测试
 *
 * 覆盖:
 *   - 正常 CREATE TABLE / ADD COLUMN → compatible:true
 *   - DROP TABLE → compatible:false (blocked)
 *   - DROP COLUMN → compatible:false (blocked)
 *   - ALTER COLUMN type → compatible:false (blocked)
 *   - 空 migrations → compatible:true
 *   - 混合变更 (ADD + DROP) → compatible:false
 *   - electron-main.ts 集成验证
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkSchemaCompatibility } from '../../src/deploy/schema-version';

describe('D48: schema-version — checkSchemaCompatibility', () => {
  it('纯 CREATE TABLE 兼容', () => {
    const result = checkSchemaCompatibility(['CREATE TABLE users (id INT)', 'CREATE TABLE posts (id INT)']);
    expect(result.compatible).toBe(true);
    expect(result.changes).toHaveLength(2);
  });

  it('ADD COLUMN 兼容', () => {
    const result = checkSchemaCompatibility(['ALTER TABLE users ADD COLUMN email TEXT']);
    expect(result.compatible).toBe(true);
  });

  it('DROP TABLE 不兼容', () => {
    const result = checkSchemaCompatibility(['DROP TABLE users']);
    expect(result.compatible).toBe(false);
    expect(result.blockedReason).toBeTruthy();
    expect(result.blockedReason).toContain('drop_table');
  });

  it('DROP COLUMN 不兼容', () => {
    const result = checkSchemaCompatibility(['ALTER TABLE users DROP COLUMN old_field']);
    expect(result.compatible).toBe(false);
    expect(result.blockedReason).toContain('drop_column');
  });

  it('ALTER COLUMN type 不兼容', () => {
    const result = checkSchemaCompatibility(['ALTER TABLE users ALTER COLUMN age TYPE BIGINT']);
    expect(result.compatible).toBe(false);
    expect(result.blockedReason).toContain('alter_column_type');
  });

  it('混合 ADD + DROP 不兼容 (有破坏性变更就阻断)', () => {
    const result = checkSchemaCompatibility([
      'CREATE TABLE new_table (id INT)',
      'ALTER TABLE users ADD COLUMN email TEXT',
      'DROP TABLE obsolete',
    ]);
    expect(result.compatible).toBe(false);
    expect(result.blockedReason).toContain('drop_table');
  });

  it('空 migrations 兼容', () => {
    const result = checkSchemaCompatibility([]);
    expect(result.compatible).toBe(true);
    expect(result.changes).toEqual([]);
  });

  it('CREATE TABLE IF NOT EXISTS 被识别为 add_table', () => {
    const result = checkSchemaCompatibility(['CREATE TABLE IF NOT EXISTS users (id INT)']);
    expect(result.compatible).toBe(true);
    expect(result.changes[0].type).toBe('add_table');
    expect(result.changes[0].table).toBe('users');
  });

  it('ALTER TABLE ... ADD COLUMN 含 COLUMN 关键词', () => {
    const result = checkSchemaCompatibility(['ALTER TABLE users ADD COLUMN email TEXT']);
    expect(result.compatible).toBe(true);
    expect(result.changes[0].type).toBe('add_column');
    expect(result.changes[0].column).toBe('email');
  });

  it('空白行和空输入正确处理', () => {
    const result = checkSchemaCompatibility(['', '  ', 'CREATE TABLE t (id INT)', '']);
    expect(result.compatible).toBe(true);
    expect(result.changes).toHaveLength(1);
  });
});

describe('D48: electron-main.ts — 集成验证', () => {
  it('import { checkSchemaCompatibility } 在 electron-main.ts 中存在', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'electron-main.ts'),
      'utf-8',
    );
    expect(content).toContain("import { checkSchemaCompatibility } from './src/deploy/schema-version'");
  });

  it('update-downloaded 中包含 schema check 调用', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'electron-main.ts'),
      'utf-8',
    );
    expect(content).toContain('const schemaResult = checkSchemaCompatibility(');
    expect(content).toContain("'升级已阻止'");
  });
});
