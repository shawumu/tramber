// packages/sdk/src/engine.ts
/**
 * Tramber Engine - 核心引擎
 *
 * 纯计算引擎，不持有任何会话状态（Conversation）。
 * 由 Client（CLI/Web/Bot）调用，传入 Conversation，返回更新后的 Conversation。
 */

import { ToolRegistryImpl } from '@tramber/tool';
import { readFileTool, writeFileTool, editFileTool, globTool, grepTool, execTool } from '@tramber/tool';
import { AnthropicProvider } from '@tramber/provider';
import { AgentLoop, type AgentLoopStep, ContextBuffer } from '@tramber/agent';
import type { Conversation } from '@tramber/agent';
import { SceneManager, CODING_SCENE_CONFIG } from '@tramber/scene';
import { SkillLoader, SkillRegistry, type SkillManifest } from '@tramber/skill';
import { RoutineManager, RoutineSolidifier } from '@tramber/routine';
import { ExperienceStorage, ExperienceRetriever, ExperienceManager } from '@tramber/experience';
import { ConfigLoader, PermissionChecker } from '@tramber/permission';
import { join } from 'path';
import type { Task, Scene, Routine, Experience } from '@tramber/shared';
import type {
  TramberEngineOptions,
  ExecuteOptions,
  ProgressUpdate,
  TramberResponse
} from './types.js';
import { debug, debugError, NAMESPACE, LogLevel } from '@tramber/shared';

/**
 * Tramber Engine - 核心引擎入口点
 */
export class TramberEngine {
  private toolRegistry: ToolRegistryImpl;
  private provider: AnthropicProvider | null = null;
  private configLoader: ConfigLoader;
  private permissionChecker: PermissionChecker;
  private sceneManager: SceneManager;
  private userSkillRegistry: SkillRegistry;
  private skillLoader: SkillLoader;
  private routineManager: RoutineManager;
  private routineSolidifier: RoutineSolidifier;
  private experienceStorage: ExperienceStorage;
  private experienceRetriever: ExperienceRetriever;
  private experienceManager: ExperienceManager;
  private agentLoopFactory: (options: any) => AgentLoop;
  private contextBuffer: ContextBuffer;

  private options: TramberEngineOptions & {
    workspacePath: string;
    configPath: string;
    enableExperience: boolean;
    enableRoutine: boolean;
  };
  private isInitialized = false;
  private permissionConfigLoaded = false;

  constructor(options: TramberEngineOptions = {}) {
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

    // 初始化 Config Loader (使用 workspacePath 作为项目根目录)
    this.configLoader = new ConfigLoader(this.options.workspacePath);

    // 初始化 Permission Checker (先使用默认配置，稍后会在 initialize 中加载实际配置)
    this.permissionChecker = new PermissionChecker({
      toolPermissions: {
        file_read: true,
        file_write: 'confirm',
        file_delete: false,
        file_rename: 'confirm',
        command_execute: ['npm', 'git', 'ls', 'cat'],
        command_dangerous: 'deny'
      },
      sandbox: {
        enabled: true,
        allowedPaths: ['./'],
        deniedPaths: [],
        deniedPatterns: [],
        maxFileSize: 10485760,
        maxExecutionTime: 30000
      }
    });

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

    // 初始化 Context Buffer（调试用）
    const contextBufferDir = join(this.options.workspacePath, '.tramber', 'contexts');
    this.contextBuffer = new ContextBuffer({
      saveDir: contextBufferDir,
      maxFiles: 10,
      enabled: true
    });

    // 初始化 Agent Loop Factory
    this.agentLoopFactory = (options: any) => new AgentLoop({
      ...options,
      contextBuffer: this.contextBuffer
    });

    // 初始化 Scene 组件
    this.sceneManager = new SceneManager(
      this.agentLoopFactory,
      this.toolRegistry
    );

    // 初始化 Skill 加载器（扫描 .tramber/skills/ 目录）
    const skillsDir = join(this.options.workspacePath, '.tramber', 'skills');
    this.skillLoader = new SkillLoader(skillsDir);
    this.userSkillRegistry = new SkillRegistry();

    // 如果有 API Key，初始化 Provider
    if (this.options.apiKey) {
      this.provider = new AnthropicProvider({
        apiKey: this.options.apiKey,
        baseURL: this.options.baseURL
      });
    }

    // 注册 Coding Scene
    this.sceneManager.registerScene(CODING_SCENE_CONFIG);
  }

  /**
   * 初始化客户端
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      debug(NAMESPACE.SDK_CLIENT, LogLevel.TRACE, 'Client already initialized');
      return;
    }

    debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'Initializing TramberEngine', {
      workspacePath: this.options.workspacePath,
      enableExperience: this.options.enableExperience,
      enableRoutine: this.options.enableRoutine
    });

    // 加载权限配置
    if (!this.permissionConfigLoaded) {
      try {
        debug(NAMESPACE.PERMISSION_CONFIG, LogLevel.VERBOSE, 'Loading permission config');
        const permissionConfig = await this.configLoader.load();
        this.permissionChecker = new PermissionChecker(permissionConfig);
        this.permissionConfigLoaded = true;
        debug(NAMESPACE.PERMISSION_CONFIG, LogLevel.BASIC, 'Permission config loaded successfully');
      } catch (error) {
        debugError(NAMESPACE.PERMISSION_CONFIG, 'Failed to load permission config, using defaults', error);
        // 保持默认配置
      }
    }

    // 加载经验数据
    if (this.options.enableExperience) {
      try {
        debug(NAMESPACE.EXPERIENCE_STORAGE, LogLevel.VERBOSE, 'Loading experiences');
        const allExperiences = await this.experienceStorage.listAll();
        this.experienceRetriever.updateExperiences(allExperiences);
        debug(NAMESPACE.EXPERIENCE_STORAGE, LogLevel.BASIC, 'Experiences loaded', {
          count: allExperiences.length
        });
      } catch (error) {
        debugError(NAMESPACE.EXPERIENCE_STORAGE, 'Failed to load experiences', error);
        // 忽略错误
      }
    }

    // 加载用户安装的 Skill
    try {
      const manifests = await this.skillLoader.loadAll();
      this.userSkillRegistry.load(manifests);
      const statePath = join(this.options.workspacePath, '.tramber', 'skills-state.json');
      await this.userSkillRegistry.loadState(statePath);
      debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'Skills loaded', {
        count: manifests.length,
        enabled: this.userSkillRegistry.getEnabled().length
      });
    } catch (error) {
      debugError(NAMESPACE.SDK_CLIENT, 'Failed to load skills', error);
    }

    this.isInitialized = true;
    debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'TramberEngine initialized successfully');
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
   *
   * 接收可选的 conversation 参数，返回更新后的 conversation。
   * Engine 不持有 conversation，每次执行都是传入+返回。
   */
  async execute(description: string, options: ExecuteOptions = {}, conversation?: Conversation): Promise<TramberResponse & { conversation?: Conversation }> {
    await this.ensureInitialized();

    debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'Executing task', {
      description,
      sceneId: options.sceneId ?? 'coding'
    });

    const steps: ProgressUpdate[] = [];

    // 检查 API Key
    if (!this.options.apiKey) {
      debugError(NAMESPACE.SDK_CLIENT, 'API Key not provided');
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

      debug(NAMESPACE.SDK_CLIENT, LogLevel.TRACE, 'Task created', { taskId: task.id });

      // 进度回调包装
      const onProgress = (update: ProgressUpdate) => {
        steps.push(update);
        options.onProgress?.(update);
      };

      // 加载相关经验
      if (this.options.enableExperience) {
        onProgress({ type: 'step', content: 'Loading experiences...' });
        debug(NAMESPACE.EXPERIENCE_MANAGER, LogLevel.VERBOSE, 'Searching for relevant experiences', {
          query: description,
          limit: 3
        });
        await this.experienceManager.search({
          target: 'skill',
          text: description,
          limit: 3
        });
      }

      // 检查是否有可用的 Routine
      if (this.options.enableRoutine) {
        onProgress({ type: 'step', content: 'Checking routines...' });
        const routines = this.routineManager.listRoutines();
        debug(NAMESPACE.ROUTINE_MANAGER, LogLevel.VERBOSE, 'Checking routines', {
          count: routines.length
        });
        // TODO: 匹配 Routine
      }

      // 创建 Agent Loop
      debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'Creating Agent Loop', {
        hasOnPermissionRequired: !!options.onPermissionRequired,
        maxIterations: options.maxIterations ?? 10
      });

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
        permissionChecker: this.permissionChecker,
        maxIterations: options.maxIterations ?? 30,
        stream: options.stream,
        onPermissionRequired: options.onPermissionRequired,
        userSkills: this.userSkillRegistry.getEnabled(),
        onStep: (step: AgentLoopStep) => {
          // 发送工具调用进度（优先级最高）
          if (step.toolCall) {
            onProgress({
              type: 'tool_call',
              iteration: step.iteration,
              toolCall: { name: step.toolCall.name, parameters: step.toolCall.parameters }
            });
            return; // 有 toolCall 时不再发送 step
          }

          // 发送工具结果进度（优先级最高）
          if (step.toolResult) {
            onProgress({
              type: 'tool_result',
              iteration: step.iteration,
              toolResult: { success: step.toolResult.success, data: step.toolResult.data, error: step.toolResult.error }
            });
            return; // 有 toolResult 时不再发送 step
          }

          // 流式文本增量（由 callLLMStream 产生的 content 字段）
          if (options.stream && step.content && !step.thinking) {
            onProgress({
              type: 'text_delta',
              iteration: step.iteration,
              content: step.content
            });
            return;
          }

          // 发送普通步骤进度（只有没有 toolCall/toolResult 时才发送）
          if (step.thinking || step.content) {
            onProgress({
              type: 'step',
              iteration: step.iteration,
              content: step.thinking ?? step.content
            });
          }
        }
      });

      // 执行任务
      onProgress({ type: 'step', content: 'Executing task...' });
      const result = await agentLoop.execute(task, conversation);

      debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'Task execution completed', {
        success: result.success,
        iterations: result.iterations,
        terminatedReason: result.terminatedReason
      });

      // 记录经验
      if (result.success && this.options.enableExperience) {
        debug(NAMESPACE.EXPERIENCE_MANAGER, LogLevel.TRACE, 'Recording successful experience');
        // TODO: 记录成功经验
      }

      return {
        success: result.success,
        result: result.success ? result.finalAnswer : undefined,
        error: result.success ? undefined : result.error,
        steps,
        terminatedReason: result.terminatedReason,
        conversation: result.conversation
      };

    } catch (error) {
      debugError(NAMESPACE.SDK_CLIENT, 'Task execution failed with exception', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        steps,
        conversation
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
   * 列出用户安装的 Skills
   */
  listUserSkills(): SkillManifest[] {
    return this.userSkillRegistry.list();
  }

  /**
   * 启用 Skill
   */
  async enableSkill(slug: string): Promise<void> {
    this.userSkillRegistry.enable(slug);
    const statePath = join(this.options.workspacePath, '.tramber', 'skills-state.json');
    await this.userSkillRegistry.saveState(statePath);
  }

  /**
   * 禁用 Skill
   */
  async disableSkill(slug: string): Promise<void> {
    this.userSkillRegistry.disable(slug);
    const statePath = join(this.options.workspacePath, '.tramber', 'skills-state.json');
    await this.userSkillRegistry.saveState(statePath);
  }

  /**
   * 列出可用的 Routines
   */
  async listRoutines(): Promise<Routine[]> {
    await this.ensureInitialized();
    return this.routineManager.listRoutines();
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
  updateConfig(options: Partial<TramberEngineOptions>): void {
    const shouldReinitProvider = options.apiKey || options.baseURL;
    Object.assign(this.options, options);

    // 如果更新了 API Key 或 baseURL，重新初始化 Provider
    if (shouldReinitProvider && this.options.apiKey) {
      this.provider = new AnthropicProvider({
        apiKey: this.options.apiKey,
        baseURL: this.options.baseURL
      });
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
