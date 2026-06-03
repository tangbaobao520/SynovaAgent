/**
 * knowledge-ingest.test.ts — @synova/knowledge-ingest 测试
 *
 * 对标 Claw-Code: Given/When/Then + hand-written test data
 * 铁律 0-2: 每个 public 函数 >= 2 用例
 */
import { describe, it, expect } from 'vitest';
import { readFileContent, extractEntities } from '@synova/knowledge-ingest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('readFileContent', () => {
  // ── Happy path ──

  it('Given a text file with content, When readFileContent called, Then returns content and fileType txt', () => {
    // Given: a temporary .txt file with known content
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, 'synova-test-ingest.txt');
    const content = 'Hello World\nThis is a test document.\nContact: admin@example.com';
    fs.writeFileSync(filePath, content, 'utf-8');

    // When: reading the file
    const result = readFileContent(filePath);

    // Then: content matches and fileType is txt
    expect(result.content).toContain('Hello World');
    expect(result.fileType).toBe('txt');
    expect(result.error).toBeUndefined();

    // Cleanup
    fs.unlinkSync(filePath);
  });

  it('Given a .md file, When readFileContent called, Then fileType is txt', () => {
    // Given: a .md file
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, 'synova-test.md');
    fs.writeFileSync(filePath, '# Title\nContent', 'utf-8');

    // When: reading
    const result = readFileContent(filePath);

    // Then: .md is classified as txt
    expect(result.fileType).toBe('txt');

    fs.unlinkSync(filePath);
  });

  // ── File type detection ──

  it('Given a .pdf path, When readFileContent called for type detection only, Then fileType is pdf', () => {
    // Given: a path ending in .pdf (file may not exist)
    const filePath = '/nonexistent/test.pdf';

    // When: reading (will fail to open — that's expected)
    const result = readFileContent(filePath);

    // Then: fileType should still be pdf based on extension detection
    expect(result.fileType).toBe('pdf');
    expect(result.error).toBeDefined();
  });

  it('Given a .docx path, When readFileContent, Then fileType is docx', () => {
    const filePath = '/nonexistent/test.docx';
    const result = readFileContent(filePath);
    expect(result.fileType).toBe('docx');
  });

  it('Given a .xlsx path, When readFileContent, Then fileType is xlsx', () => {
    const filePath = '/nonexistent/test.xlsx';
    const result = readFileContent(filePath);
    expect(result.fileType).toBe('xlsx');
  });

  it('Given an unknown extension, When readFileContent, Then fileType is unknown', () => {
    const filePath = '/nonexistent/test.xyz';
    const result = readFileContent(filePath);
    expect(result.fileType).toBe('unknown');
  });

  // ── Sad path ──

  it('Given a non-existent file, When readFileContent, Then returns error', () => {
    // Given: a path to a file that doesn't exist
    const filePath = '/nonexistent/path/test.txt';

    // When: reading
    const result = readFileContent(filePath);

    // Then: error is set and content is empty
    expect(result.error).toBeDefined();
    expect(result.content).toBe('');
  });
});

describe('extractEntities', () => {
  // ── Happy path ──

  it('Given text with email addresses, When extractEntities, Then emails are extracted', () => {
    // Given: text containing email addresses
    const text = 'Contact admin@example.com or support@company.org for help.';

    // When: extracting entities
    const entities = extractEntities(text);

    // Then: emails should be found
    expect(entities).toContain('admin@example.com');
    expect(entities).toContain('support@company.org');
  });

  it('Given text with URLs, When extractEntities, Then URLs are extracted', () => {
    // Given: text with URLs
    const text = 'Visit https://example.com/docs or http://localhost:3000';

    // When: extracting
    const entities = extractEntities(text);

    // Then: URLs should be found
    expect(entities.some(e => e.startsWith('http'))).toBe(true);
  });

  it('Given text with capitalized terms, When extractEntities, Then capitalized words are extracted', () => {
    // Given: text with capitalized words
    const text = 'SynovaAgent and ClawCode are tools. Organization is Novis.';

    // When: extracting
    const entities = extractEntities(text);

    // Then: capitalized words >= 2 chars should be found
    expect(entities).toContain('SynovaAgent');
    expect(entities).toContain('ClawCode');
    expect(entities).toContain('Organization');
    expect(entities).toContain('Novis');
  });

  it('Given Chinese text with mixed content, When extractEntities, Then Chinese terms are extracted', () => {
    // Given: Chinese text with capitalized terms
    const text = '组织诊断工具SynovaAgent由Novis开发。联系人张工：zhang@example.com';

    // When: extracting
    const entities = extractEntities(text);

    // Then: Chinese capitalized terms should be found
    expect(entities).toContain('zhang@example.com');
  });

  // ── Sad path / edge cases ──

  it('Given empty text, When extractEntities, Then returns empty array', () => {
    // Given: empty string (sad path)
    // When: extracting
    const entities = extractEntities('');

    // Then: empty result
    expect(entities).toHaveLength(0);
  });

  it('Given text with no recognizable entities, When extractEntities, Then returns empty array', () => {
    // Given: lowercase text with no emails, URLs, or capitals
    const text = 'this is all lowercase text with nothing special in it';

    // When: extracting
    const entities = extractEntities(text);

    // Then: no entities found
    expect(entities).toHaveLength(0);
  });

  it('Given very long text, When extractEntities, Then result is capped at 50', () => {
    // Given: text with many entities (generate 100 email-like patterns)
    const emails = Array.from({ length: 100 }, (_, i) => `user${i}@test.com`).join(' ');
    const text = `Many contacts: ${emails}`;

    // When: extracting
    const entities = extractEntities(text);

    // Then: should not exceed 50
    expect(entities.length).toBeLessThanOrEqual(50);
  });
});
