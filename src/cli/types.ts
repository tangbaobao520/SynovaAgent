/**
 * cli/types.ts — CLI 公共类型定义 (Era C6)
 */

export interface CLICommand {
  name: string;
  description: string;
  /** 子命令: 'list' | 'show' | 'create' | 'edit' | 'delete' | 'set' */
  subcommands: string[];
  handler: (args: string[]) => Promise<void>;
}
