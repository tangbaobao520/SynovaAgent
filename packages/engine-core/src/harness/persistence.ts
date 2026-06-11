// Stub harness persistence for engine-core standalone build

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/harness/persistence');

const HOME = process.env.USERPROFILE || process.env.HOME || '/tmp';
const BASE = path.join(HOME, '.claworg', 'data');

export function loadJSON<T>(dir: string, key: string, fallback: T): T {
  const filePath = path.join(BASE, dir, `${key}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch { log.debug('[harness/persistence] failed to load JSON, using fallback'); /* fall through */ }
  return fallback;
}

export function saveJSON(dir: string, key: string, data: unknown): void {
  const dirPath = path.join(BASE, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, `${key}.json`), JSON.stringify(data, null, 2), 'utf-8');
}
