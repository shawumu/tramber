// packages/client/cli/src/command-handler.ts
/**
 * Command Handler - 命令处理器
 *
 * 职责：
 * - 处理所有 REPL 命令（/help, /scene, /skills, /routines, /config, /clear）
 * - 分离业务逻辑和 REPL 层
 */

import type { TramberEngine } from '@tramber/sdk';
import type { CliContext } from './config.js';
import { outputManager } from './output-manager.js';

/**
 * 命令处理器
 */
export class CommandHandler {
  /**
   * 处理命令
   */
  async handle(command: string, client: TramberEngine, context: CliContext): Promise<void> {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '/help':
        this.showHelp();
        break;

      case '/scene':
        await this.handleScene(args, client, context);
        break;

      case '/skills':
        await this.handleSkills(client, context);
        break;

      case '/routines':
        await this.handleRoutines(client, context);
        break;

      case '/config':
        this.handleConfig(args, context);
        break;

      case '/clear':
        outputManager.clear();
        break;

      default:
        outputManager.writeln(`Unknown command: ${cmd}`);
        outputManager.writeln('Type /help for available commands.');
    }
  }

  /**
   * 显示帮助
   */
  private showHelp(): void {
    outputManager.writeln('');
    outputManager.writeln('Available Commands:');
    outputManager.writeln('  /help      - Show this help message');
    outputManager.writeln('  /scene     - List or switch scenes');
    outputManager.writeln('  /skills    - List available skills');
    outputManager.writeln('  /routines  - List available routines');
    outputManager.writeln('  /config    - Show or set configuration');
    outputManager.writeln('  /clear     - Clear the screen');
    outputManager.writeln('  /exit      - Exit the REPL');
    outputManager.writeln('');
  }

  /**
   * 处理场景命令
   */
  private async handleScene(args: string[], client: TramberEngine, context: CliContext): Promise<void> {
    if (args.length === 0) {
      const scenes = await client.listScenes();
      outputManager.writeln('');
      outputManager.writeln('Available Scenes:');
      for (const scene of scenes) {
        outputManager.writeln(`  • ${scene.name} (${scene.id})`);
        outputManager.writeln(`    ${scene.description}`);
      }
      outputManager.writeln('');
      outputManager.writeln(`Current: ${context.config.scene ?? 'coding'}`);
      outputManager.writeln('');
    } else {
      const sceneId = args[0];
      context.config.scene = sceneId;
      outputManager.writeln(`✓ Scene switched to: ${sceneId}`);
    }
  }

  /**
   * 处理技能命令
   */
  private async handleSkills(client: TramberEngine, context: CliContext): Promise<void> {
    const skills = client.listUserSkills();
    outputManager.writeln('');
    if (skills.length === 0) {
      outputManager.writeln('No skills installed. Add skills to .tramber/skills/');
    } else {
      outputManager.writeln('Installed Skills:');
      for (const skill of skills) {
        const status = skill.enabled ? '✓' : '✗';
        const ver = skill.version ? ` v${skill.version}` : '';
        outputManager.writeln(`  ${status} ${skill.slug}${ver}  ${skill.description}`);
      }
    }
    outputManager.writeln('');
  }

  /**
   * 处理例程命令
   */
  private async handleRoutines(client: TramberEngine, context: CliContext): Promise<void> {
    const routines = await client.listRoutines();
    outputManager.writeln('');
    outputManager.writeln('Available Routines:');
    if (routines.length === 0) {
      outputManager.writeln('  No routines available yet.');
      outputManager.writeln('  Routines are automatically created from successful skills.');
    } else {
      for (const routine of routines) {
        outputManager.writeln(`  • ${routine.name} (${routine.id})`);
        outputManager.writeln(`    ${routine.description}`);
        outputManager.writeln(`    Success rate: ${(routine.stats.successRate * 100).toFixed(0)}%`);
      }
    }
    outputManager.writeln('');
  }

  /**
   * 处理配置命令
   */
  private handleConfig(args: string[], context: CliContext): void {
    if (args.length === 0) {
      outputManager.writeln('');
      outputManager.writeln('Current Configuration:');
      outputManager.writeln(`  Provider:   ${context.config.provider ?? 'anthropic'}`);
      outputManager.writeln(`  Model:      ${context.config.model ?? 'claude-sonnet-4-6'}`);
      outputManager.writeln(`  Scene:      ${context.config.scene ?? 'coding'}`);
      outputManager.writeln(`  Max Iter:   ${String(context.config.maxIterations ?? 10)}`);
      outputManager.writeln(`  Experience: ${context.config.enableExperience ? 'enabled' : 'disabled'}`);
      outputManager.writeln(`  Routine:    ${context.config.enableRoutine ? 'enabled' : 'disabled'}`);
      outputManager.writeln('');
    } else {
      const [key, value] = args;
      if (key && value) {
        (context.config as any)[key] = value;
        outputManager.writeln(`✓ Set ${key} = ${value}`);
      }
    }
  }
}
