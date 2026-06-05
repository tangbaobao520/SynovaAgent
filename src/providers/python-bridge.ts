/**
 * providers/python-bridge.ts — TypeScript ⇄ Python 子进程通信桥梁
 *
 * Day 1 T1.6: Python Bridge 基础设施。
 * 所有 Python 连接器通过此桥梁调用。
 */
import { spawn } from 'child_process';
import { createLogger } from '../logger';
import * as crypto from 'crypto';

const log = createLogger('providers/python-bridge');

export class PythonBridge {
  private pythonPath: string;

  constructor(pythonPath = 'python3') {
    this.pythonPath = pythonPath;
  }

  async run<T = Record<string, unknown>>(module: string, command: string, params: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, ['-m', `synova_worker.${module}`], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
        env: { PYTHONUNBUFFERED: '1', ...process.env },
      });

      const requestId = crypto.randomUUID();
      const input = JSON.stringify({ command, params, requestId });
      let output = '';
      let errorOutput = '';

      proc.stdin.write(input + '\n');
      proc.stdin.end();

      proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          log.warn({ code, stderr: errorOutput.slice(0, 200) }, 'Python 进程异常退出');
          reject(new Error(`Python 进程退出码 ${code}: ${errorOutput.slice(0, 200)}`));
          return;
        }
        try {
          const result = JSON.parse(output);
          if (!result.success) {
            reject(new Error(result.error?.message || 'Python 进程返回错误'));
          } else {
            resolve(result.result as T);
          }
        } catch (err: any) {
          log.warn({ output: output.slice(0, 200) }, 'Python 输出 JSON 解析失败');
          reject(new Error(`Python JSON 解析失败: ${err.message}`));
        }
      });

      proc.on('error', (err) => {
        log.warn({ err }, 'Python 进程启动失败');
        reject(new Error(`Python 进程不可用 (${this.pythonPath}): ${err.message}`));
      });
    });
  }

  /** Health check — can Python be called? */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.run<{ status: string }>('', 'ping', {});
      return result.status === 'ok';
    } catch (err: any) {
      log.debug({ err: err.message }, 'Python bridge health check failed');
      return false;
    }
  }
}

// Singleton
let _bridge: PythonBridge | null = null;
export function getPythonBridge(inject?: PythonBridge): PythonBridge {
  if (inject) { _bridge = inject; return inject; }
  if (!_bridge) _bridge = new PythonBridge();
  return _bridge;
}
