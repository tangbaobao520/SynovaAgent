/**
 * fresh-db.ts — GSS 临时库目录生成（黄金场景共享基建 1/4）
 *
 * 一句话: 为场景运行生成隔离的临时数据目录——让服务自建 schema，绝不复制真实库。
 *
 * 契约:
 *   @input  — --dir <路径>（可选: 指定目录；默认 os.tmpdir() 下自建）
 *             --ensure-temp（要求目录必须在系统临时区，否则 exit 2）
 *   @output — stdout 输出临时目录绝对路径（run.sh 直接捕获）
 *   @degraded — 目录创建失败 → exit 2 + stderr "degraded: ..."（fail-closed）
 *
 * 铁律 0-4 防线设计（2026-08-16 决策，D333 可核）:
 *   真实库的物理防线在 bootstrap.ts——它只接受系统临时区数据目录（其余一律 exit 2），
 *   场景链（fresh-db → bootstrap）结构上不可能触达 data/synova.db。
 *   本工具不再检查 SYNOVA_DB_PATH/SYNOVA_DATA_DIR 环境变量——实测（08-16）证明
 *   开发者会话环境常自带指向真实库的该变量，误报会连"创建临时目录"都拒绝，
 *   且本工具根本不消费这些变量。物理执法 > 环境探测。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ESM 主模块判断（package.json type=module 下 require.main 不可用）
const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

interface FreshDbResult {
  dir: string;
  temp: boolean;
}

export function freshDb(opts: { dir?: string; ensureTemp?: boolean } = {}): FreshDbResult {
  const { dir, ensureTemp } = opts;

  let target: string;
  let temp = true;
  if (dir) {
    target = path.resolve(dir);
    if (ensureTemp) {
      const tmpRoot = path.resolve(os.tmpdir());
      if (!target.startsWith(tmpRoot + path.sep)) {
        console.error(`degraded: --ensure-temp 要求目录在系统临时区（${tmpRoot}），得到 ${target}`);
        process.exit(2);
      }
    }
    temp = false;
  } else {
    target = fs.mkdtempSync(path.join(os.tmpdir(), 'synova-gs-'));
  }

  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (e) {
    console.error(`degraded: 无法创建临时数据目录 ${target}: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  return { dir: target, temp };
}

if (isMain) {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf('--dir');
  const dir = dirIdx >= 0 ? args[dirIdx + 1] : undefined;
  const ensureTemp = args.includes('--ensure-temp');
  const r = freshDb({ dir, ensureTemp });
  console.log(r.dir);
}
