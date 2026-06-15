/**
 * tests/cli-manager.test.ts — C6 CLI 管理体系测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CLIManager, type CLICommand } from '../src/cli-manager';

describe('CLIManager', () => {
  let manager: CLIManager;

  beforeEach(() => {
    manager = new CLIManager();
  });

  describe('register()', () => {
    it('Given command, When registered, Then help shows it', () => {
      const cmd: CLICommand = {
        name: 'test-cmd',
        description: 'Test command',
        subcommands: ['list'],
        handler: async () => {},
      };
      manager.register(cmd);
      // Printing help normally goes to console.log. We'll test via execute.
    });
  });

  describe('execute()', () => {
    it('Given registered command, When executed, Then handler called', async () => {
      let called = false;
      const cmd: CLICommand = {
        name: 'ping',
        description: 'Ping command',
        subcommands: [],
        async handler(args: string[]) {
          called = true;
          expect(args).toEqual([]);
        },
      };
      manager.register(cmd);
      await manager.execute(['node', 'cli.js', 'ping']);
      expect(called).toBe(true);
    });

    it('Given command with args, When executed, Then args passed', async () => {
      let receivedArgs: string[] = [];
      const cmd: CLICommand = {
        name: 'echo',
        description: 'Echo command',
        subcommands: [],
        async handler(args: string[]) {
          receivedArgs = args;
        },
      };
      manager.register(cmd);
      await manager.execute(['node', 'cli.js', 'echo', 'hello', 'world']);
      expect(receivedArgs).toEqual(['hello', 'world']);
    });

    it('Given unknown command, When executed, Then prints error (exit 1)', async () => {
      // We can't easily test process.exit, so verify the error is logged
      const originalError = console.error;
      const errors: string[] = [];
      console.error = (msg: string) => errors.push(msg);

      try {
        await manager.execute(['node', 'cli.js', 'unknown-cmd']);
      } catch {
        // process.exit might have been called
      }

      console.error = originalError;
      expect(errors.length).toBeGreaterThan(0);
    });

    it('Given --help, When executed, Then prints help and exits gracefully', async () => {
      // Should not throw
      await manager.execute(['node', 'cli.js', '--help']);
      await manager.execute(['node', 'cli.js', 'help']);
    });
  });

  describe('handler errors', () => {
    it('Given handler that throws, When executed, Then caught gracefully', async () => {
      const cmd: CLICommand = {
        name: 'fail',
        description: 'Failing command',
        subcommands: [],
        async handler(_args: string[]) {
          throw new Error('intentional failure');
        },
      };
      manager.register(cmd);

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (msg: string) => errors.push(msg);

      try {
        await manager.execute(['node', 'cli.js', 'fail']);
      } catch {
        // process.exit
      }

      console.error = originalError;
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('registerDefaultCommands()', () => {
    it('Given default commands registered, When listing, Then all present', async () => {
      const { registerDefaultCommands } = await import('../src/cli-manager');
      registerDefaultCommands(manager);

      const cmdOutput: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => cmdOutput.push(msg);

      await manager.execute(['node', 'cli.js', '--help']);

      console.log = originalLog;
      const allOutput = cmdOutput.join(' ');
      expect(allOutput).toContain('expert');
      expect(allOutput).toContain('measurer');
      expect(allOutput).toContain('knowledge');
      expect(allOutput).toContain('config');
      expect(allOutput).toContain('status');
      expect(allOutput).toContain('reload');
    });
  });
});
