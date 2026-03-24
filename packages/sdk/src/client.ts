// packages/sdk/src/client.ts
/**
 * Tramber Client - 统一客户端接口
 *
 * 提供高层 API 来使用 Tramber 的所有功能
 */

import { ToolRegistryImpl } from '@tramber/tool';
import { readFileTool, writeFileTool, editFileTool, globTool, grepTool, execTool } from '@tramber/tool';
import { AnthropicProvider } from '@tramber/provider';
import { AgentLoop, type AgentLoopStep } from '@tramber/agent';
import { SceneManager, SkillRegistry, CODING_SCENE_CONFIG, getCodingSkills } from '@tramber/scene';
import { RoutineManager, RoutineSolidifier } from '@tramber/routine';
import { ExperienceStorage, ExperienceRetriever, ExperienceManager } from '@tramber/experience';
import { join } from 'path';
import type { Task, Scene, Skill, Routine, Experience } from '@tramber/shared';
import type {
  TramberClientOptions,
  ExecuteOptions,
  ProgressUpdate,
  TramberResponse,
  ListOptions
} from './types.js';

/**
 * Tramber Client - 主要入口点
 */
export class TramberClient {
  private toolRegistry: ToolRegistryImpl;
  private provider: AnthropicProvider | null = null;
  private sceneManager: SceneManager;
  private skillRegistry: SkillRegistry;
  private routineManager: RoutineManager;
  private routineSolidifier: RoutineSolidifier;
  private experienceStorage: ExperienceStorage;
  private experienceRetriever: ExperienceRetriever;
  private experienceManager: ExperienceManager;
  private agentLoopFactory: (options: any) => AgentLoop;

  private options: TramberClientOptions & {
    workspacePath: string;
    configPath: string;
    enableExperience: boolean;
    enableRoutine: boolean;
  };
  private isInitialized = false;

  constructor(options: TramberClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '';
    const model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
    const baseURL = options.baseURL ?? process.env.ANTHROPIC_BASE_URL;

    this.options = {
      apiKey,
      provider: options.provider ?? 'anthropic',
      model,
      baseURL,
      workspacePath: options.workspacePath ?? process.cwd(),
      configPath: options.configPath ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.tramber', 'settings.json'),
      enableExperience: options.enableExperience ?? true,
      enableRoutine: options.enableRoutine ?? true
    };

    // 初始化 Tool Registry
    this.toolRegistry = new ToolRegistryImpl();
    this.toolRegistry.register(readFileTool);
    this.toolRegistry.register(writeFileTool);
    this.toolRegistry.register(editFileTool);
    this.toolRegistry.register(globTool);
    this.toolRegistry.register(grepTool);
    this.toolRegistry.register(execTool);

    // 初始化 Experience 组件
    this.experienceStorage = new ExperienceStorage({
      rootPath: this.options.workspacePath,
      autoCreate: true
    });
    this.experienceRetriever = new ExperienceRetriever([]);
    this.experienceManager = new ExperienceManager(
      this.experienceStorage,
      this.experienceRetriever
    );

    // 初始化 Routine 组件
    this.routineManager = new RoutineManager();
    this.routineSolidifier = new RoutineSolidifier();

    // 初始化 Agent Loop Factory
    this.agentLoopFactory = (options: any) => new AgentLoop(options);

    // 初始化 Scene & Skill 组件
    this.sceneManager = new SceneManager(
      this.agentLoopFactory,
      this.toolRegistry
    );
    this.skillRegistry = new SkillRegistry({
      agentLoopFactory: this.agentLoopFactory,
      toolRegistry: this.toolRegistry,
      provider: null as any // 稍后设置
    });

    // 如果有 API Key，初始化 Provider
    if (this.options.apiKey) {
      this.provider = new AnthropicProvider({
        apiKey: this.options.apiKey,
        baseURL: this.options.baseURL
      });

      // 更新 Skill Registry 的 provider
      (this.skillRegistry as any).options.provider = this.provider;
    }

    // 注册 Coding Scene
    this.sceneManager.registerScene(CODING_SCENE_CONFIG);

    // 注册 Coding Skills
    const skills = getCodingSkills();
    this.skillRegistry.registerSkills(skills as any[]);
  }

  /**
   * 初始化客户端
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // 加载经验数据
    if (this.options.enableExperience) {
      try {
        const allExperiences = await this.experienceStorage.listAll();
        this.experienceRetriever.updateExperiences(allExperiences);
      } catch {
        // 忽略错误
      }
    }

    this.isInitialized = true;
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * 执行任务
   */
  async execute(description: string, options: ExecuteOptions = {}): Promise<TramberResponse> {
    await this.ensureInitialized();

    const steps: ProgressUpdate[] = [];

    // 检查 API Key
    if (!this.options.apiKey) {
      return {
        success: false,
        error: 'API Key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey option.',
        steps
      };
    }

    try {
      // 创建任务
      const task: Task = {
        id: `task-${Date.now()}`,
        description,
        sceneId: options.sceneId ?? 'coding',
        isComplete: false,
        inputs: { workspacePath: this.options.workspacePath }
      };

      // 进度回调包装
      const onProgress = (update: ProgressUpdate) => {
        steps.push(update);
        options.onProgress?.(update);
      };

      // 加载相关经验
      if (this.options.enableExperience) {
        onProgress({ type: 'step', content: 'Loading experiences...' });
        await this.experienceManager.search({
          target: 'skill',
          text: description,
          limit: 3
        });
      }

      // 检查是否有可用的 Routine
      if (this.options.enableRoutine) {
        onProgress({ type: 'step', content: 'Checking routines...' });
        this.routineManager.listRoutines();
        // TODO: 匹配 Routine
      }

      // 创建 Agent Loop
      const agentLoop = this.agentLoopFactory({
        agent: {
          id: 'tramber-agent',
          name: 'Tramber',
          description: 'AI Assisted Programming Assistant',
          sceneId: options.sceneId ?? 'coding',
          temperature: 0.7,
          maxTokens: 4096
        },
        provider: this.provider!,
        toolRegistry: this.toolRegistry,
        maxIterations: options.maxIterations ?? 10,
        onStep: (step: AgentLoopStep) => {
          onProgress({
            type: 'step',
            iteration: step.iteration,
            content: step.thinking ?? step.content,
            toolCall: step.toolCall ? { name: step.toolCall.name, parameters: step.toolCall.parameters } : undefined,
            toolResult: step.toolResult ? { success: step.toolResult.success, data: step.toolResult.data, error: step.toolResult.error } : undefined
          });
        }
      });

      // 执行任务
      onProgress({ type: 'step', content: 'Executing task...' });
      const result = await agentLoop.execute(task);

      // 记录经验
      if (result.success && this.options.enableExperience) {
        // TODO: 记录成功经验
      }

      return {
        success: result.success,
        result: result.finalAnswer,
        steps
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        steps
      };
    }
  }

  /**
   * 列出可用的 Scenes
   */
  async listScenes(): Promise<Scene[]> {
    await this.ensureInitialized();
    return this.sceneManager.listScenes();
  }

  /**
   * 列出可用的 Skills
   */
  async listSkills(options?: ListOptions): Promise<Skill[]> {
    await this.ensureInitialized();
    return this.skillRegistry.listSkills(options?.category);
  }

  /**
   * 列出可用的 Routines
   */
  async listRoutines(): Promise<Routine[]> {
    await this.ensureInitialized();
    return this.routineManager.listRoutines();
  }

  /**
   * 执行 Skill
   */
  async executeSkill(skillId: string, inputs: Record<string, unknown> = {}): Promise<TramberResponse> {
    await this.ensureInitialized();

    const result = await this.skillRegistry.executeSkill({
      skillId,
      inputs,
      workspacePath: this.options.workspacePath
    });

    return {
      success: result.success,
      result: result.output,
      steps: result.steps as any[],
      error: result.error
    };
  }

  /**
   * 执行 Routine
   */
  async executeRoutine(routineId: string, inputs: Record<string, unknown> = {}): Promise<TramberResponse> {
    await this.ensureInitialized();

    const result = await this.routineManager.executeRoutine(routineId, {
      inputs,
      toolRegistry: this.toolRegistry
    });

    return {
      success: result.success,
      result: result.result,
      error: result.error
    };
  }

  /**
   * 搜索经验
   */
  async searchExperiences(query: string, limit = 5): Promise<Experience[]> {
    await this.ensureInitialized();
    return this.experienceManager.search({
      target: 'skill',
      text: query,
      limit
    });
  }

  /**
   * 添加经验
   */
  async addExperience(experience: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>): Promise<Experience> {
    await this.ensureInitialized();
    return this.experienceManager.record(experience);
  }

  /**
   * 获取配置
   */
  getConfig(): typeof this.options {
    return { ...this.options };
  }

  /**
   * 更新配置
   */
  updateConfig(options: Partial<TramberClientOptions>): void {
    const shouldReinitProvider = options.apiKey || options.baseURL;
    Object.assign(this.options, options);

    // 如果更新了 API Key 或 baseURL，重新初始化 Provider
    if (shouldReinitProvider && this.options.apiKey) {
      this.provider = new AnthropicProvider({
        apiKey: this.options.apiKey,
        baseURL: this.options.baseURL
      });
      (this.skillRegistry as any).options.provider = this.provider;
    }
  }

  /**
   * 关闭客户端
   */
  async close(): Promise<void> {
    // 清理资源
    await this.experienceManager?.refreshCache();
  }
}
