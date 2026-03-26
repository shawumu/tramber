// packages/scene/src/scene-manager.ts
/**
 * Scene Manager - 场景管理器
 *
 * 负责管理 Coding Scene 的创建、执行和状态跟踪
 */

import type { Scene, Workflow, SceneCategory, Task } from '@tramber/shared';
import type { AgentLoop, AgentLoopOptions, AgentLoopStep } from '@tramber/agent';
import type { ToolRegistry } from '@tramber/tool';

export interface SceneExecutionContext {
  sceneId: string;
  inputs: Record<string, unknown>;
  workspacePath: string;
}

export interface SceneExecutionResult {
  success: boolean;
  output?: unknown;
  steps: AgentLoopStep[];
  error?: string;
}

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private workflows = new Map<string, Workflow>();

  constructor(
    private agentLoopFactory: (options: AgentLoopOptions) => AgentLoop,
    private toolRegistry: ToolRegistry
  ) {}

  registerScene(scene: Scene): void {
    this.scenes.set(scene.id, scene);
  }

  unregisterScene(sceneId: string): void {
    this.scenes.delete(sceneId);
  }

  getScene(sceneId: string): Scene | undefined {
    return this.scenes.get(sceneId);
  }

  listScenes(category?: SceneCategory): Scene[] {
    const scenes = Array.from(this.scenes.values());
    if (category) {
      return scenes.filter(s => s.category === category);
    }
    return scenes;
  }

  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  unregisterWorkflow(workflowId: string): void {
    this.workflows.delete(workflowId);
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  async executeScene(context: SceneExecutionContext): Promise<SceneExecutionResult> {
    const scene = this.scenes.get(context.sceneId);
    if (!scene) {
      return {
        success: false,
        steps: [],
        error: `Scene ${context.sceneId} not found`
      };
    }

    // 创建任务
    const task: Task = {
      id: `task-${Date.now()}`,
      description: scene.description,
      sceneId: scene.id,
      isComplete: false,
      inputs: context.inputs
    };

    // 获取或创建 Agent
    const agent = {
      id: `agent-${scene.id}`,
      name: `${scene.name} Agent`,
      description: scene.description,
      sceneId: scene.id,
      temperature: 0.7,
      maxTokens: 4096
    };

    // 创建 Agent Loop
    const agentLoop = this.agentLoopFactory({
      agent,
      provider: null as any, // TODO: 从外部注入
      toolRegistry: this.toolRegistry,
      maxIterations: 10
    });

    try {
      // 执行 Agent Loop
      const result = await agentLoop.execute(task);

      return {
        success: result.success,
        output: result.success ? result.finalAnswer : undefined,
        steps: result.steps
      };
    } catch (error) {
      return {
        success: false,
        steps: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
