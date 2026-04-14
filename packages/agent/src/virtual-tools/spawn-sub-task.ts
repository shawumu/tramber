// packages/agent/src/virtual-tools/spawn-sub-task.ts
/**
 * spawn_sub_task — 派生执行意识处理子任务（Stage 9 重构）
 *
 * 核心虚拟工具：父意识通过此工具创建子意识，同步执行后返回压缩结果。
 * 使用 createDomainChild 替代过时的 spawnChild。
 */

import type { Tool, ToolResult } from '@tramber/tool';
import type { VirtualToolContext } from './index.js';
import type { ExecutionContext } from '@tramber/shared';
import { buildExecutionPrompt } from '../consciousness-prompts.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';
import { createConversation } from '../conversation.js';
import type { Task } from '@tramber/shared';

const NS = NAMESPACE.CONSCIOUSNESS_MANAGER;

export class SpawnSubTaskTool implements Tool {
  id = 'spawn_sub_task';
  name = 'spawn_sub_task';
  description = '派生执行意识处理子任务。执行意识将独立运行，你会在其完成后收到压缩后的结果摘要。';
  category = 'execution' as const;
  permission = { level: 'safe' as const, operation: 'file_read' as const };
  inputSchema = {
    type: 'object' as const,
    properties: {
      taskDescription: {
        type: 'string' as const,
        description: '清晰具体的子任务描述'
      },
      domain: {
        type: 'string' as const,
        description: '所属领域（默认"执行"）'
      },
      constraints: {
        type: 'array' as const,
        description: '子任务必须遵守的约束条件',
        items: { type: 'string' as const, description: '约束条件' }
      },
      contextForChild: {
        type: 'string' as const,
        description: '传递给执行意识的关键上下文（精要，非完整历史）'
      },
      allowedTools: {
        type: 'array' as const,
        description: '允许执行意识使用的工具列表',
        items: { type: 'string' as const, description: '工具 ID' }
      },
      maxIterations: {
        type: 'number' as const,
        description: '最大迭代次数（默认 10）'
      }
    },
    required: ['taskDescription']
  };

  private context: VirtualToolContext;

  constructor(context: VirtualToolContext) {
    this.context = context;
  }

  async execute(input: unknown): Promise<ToolResult> {
    const params = input as {
      taskDescription: string;
      domain?: string;
      constraints?: string[];
      contextForChild?: string;
      allowedTools?: string[];
      maxIterations?: number;
    };

    if (!params.taskDescription) {
      return { success: false, error: 'taskDescription is required' };
    }

    const { consciousnessManager, createLoop } = this.context;
    const domain = params.domain || 'execution';

    try {
      // 1. 创建执行意识状态（使用 createDomainChild）
      const execState = consciousnessManager.createDomainChild(
        domain,
        params.taskDescription,
        params.taskDescription,
        {
          constraints: params.constraints,
          contextForChild: params.contextForChild,
          allowedTools: params.allowedTools,
          maxIterations: params.maxIterations
        }
      );

      debug(NS, LogLevel.BASIC, 'Spawning execution consciousness', {
        id: execState.id,
        domain,
        task: params.taskDescription.slice(0, 80)
      });

      // 2. 创建子 AgentLoop
      const childLoop = createLoop({
        allowedTools: params.allowedTools,
        maxIterations: params.maxIterations ?? 10
      });

      // 3. Stage 9: 组装执行纲领（如果有 taskId）
      const taskId = consciousnessManager.getTaskId();
      let execContext: ExecutionContext | undefined;
      if (taskId) {
        execContext = consciousnessManager.assembleExecutionContext(taskId, domain);
      }

      // 4. 构建子意识的 system prompt
      const basePrompt = childLoop.buildSystemPrompt();
      const execPrompt = buildExecutionPrompt(basePrompt, execState, undefined, execContext);

      // 5. 创建子意识的 conversation
      const conversation = createConversation({
        systemPrompt: execPrompt,
        projectInfo: { rootPath: process.cwd(), name: 'project' }
      });

      // 6. 创建子任务
      const task: Task = {
        id: execState.id,
        description: params.taskDescription,
        sceneId: 'execution',
        isComplete: false
      };

      // 7. 同步执行子 loop
      consciousnessManager.updateStatus(execState.id, 'thinking');
      const result = await childLoop.execute(task, conversation);

      // 8. 更新状态
      consciousnessManager.updateStatus(
        execState.id,
        result.success ? 'completed' : 'failed'
      );

      // 9. 压缩结果
      const parentId = this.context.currentConsciousnessId;
      if (parentId) {
        consciousnessManager.updateStatus(parentId, 'compressing');
      }
      const fullMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: conversation.systemPrompt },
        ...conversation.messages.map(m => ({ role: m.role, content: m.content }))
      ];
      const summary = consciousnessManager.compressResult(
        execState.id,
        {
          consciousnessId: execState.id,
          success: result.success,
          finalAnswer: result.success ? result.finalAnswer : '',
          filesTouched: [],
          tokenUsage: result.conversation.tokenUsage,
          iterations: result.iterations,
          error: result.success ? undefined : result.error
        },
        fullMessages
      );
      if (parentId) {
        consciousnessManager.updateStatus(parentId, 'thinking');
      }

      debug(NS, LogLevel.BASIC, 'Execution consciousness completed', {
        id: execState.id,
        success: result.success,
        iterations: result.iterations
      });

      return {
        success: result.success,
        data: {
          consciousnessId: execState.id,
          summary,
          iterations: result.iterations,
          error: result.success ? undefined : result.error
        }
      };
    } catch (err) {
      debugError(NS, 'Failed to spawn sub task', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}