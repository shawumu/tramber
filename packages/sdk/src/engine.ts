// packages/sdk/src/engine.ts
/**
 * Tramber Engine - 核心引擎
 *
 * 纯计算引擎，不持有任何会话状态（Conversation）。
 * 由 Client（CLI/Web/Bot）调用，传入 Conversation，返回更新后的 Conversation。
 */

import { ToolRegistryImpl } from '@tramber/tool';
import { readFileTool, writeFileTool, editFileTool, globTool, grepTool, execTool } from '@tramber/tool';
import { AnthropicProvider, providerFactory } from '@tramber/provider';
import type { AIProvider } from '@tramber/provider';
import { AgentLoop, type AgentLoopStep, ContextBuffer, ConsciousnessManager, MemoryStore, ContextStorage } from '@tramber/agent';
import type { Conversation } from '@tramber/agent';
import { SceneManager, CODING_SCENE_CONFIG } from '@tramber/scene';
import { SkillLoader, SkillRegistry, type SkillManifest } from '@tramber/skill';
import { RoutineManager, RoutineSolidifier } from '@tramber/routine';
import { ExperienceStorage, ExperienceRetriever, ExperienceManager } from '@tramber/experience';
import { ConfigLoader, PermissionChecker } from '@tramber/permission';
import { join } from 'path';
import type { Task, Scene, Routine, Experience, SelfAwarenessState } from '@tramber/shared';
import type {
  TramberEngineOptions,
  ExecuteOptions,
  ProgressUpdate,
  TramberResponse
} from './types.js';
import { debug, debugError, NAMESPACE, LogLevel, generateId } from '@tramber/shared';
import { registerVirtualTools, unregisterVirtualTools, type VirtualToolContext } from '@tramber/agent';

/**
 * Tramber Engine - 核心引擎入口点
 */
export class TramberEngine {
  private toolRegistry: ToolRegistryImpl;
  private provider: AIProvider | null = null;
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
  private consciousnessManager: ConsciousnessManager | null = null;
  private memoryStore: MemoryStore | null = null;
  private contextStorage: ContextStorage | null = null;

  private options: TramberEngineOptions & {
    workspacePath: string;
    configPath: string;
    enableExperience: boolean;
    enableRoutine: boolean;
    enableConsciousness: boolean;
  };
  private isInitialized = false;
  private permissionConfigLoaded = false;
  /** 当前会话 ID（多轮对话复用，确保 context 存入同一目录） */
  private currentTaskId: string | null = null;

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
      enableRoutine: options.enableRoutine ?? true,
      enableConsciousness: options.enableConsciousness ?? true
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
    // 意识体模式下禁用旧的扁平 ContextBuffer，由 ContextStorage 替代
    const contextBufferDir = join(this.options.workspacePath, '.tramber', 'contexts');
    this.contextBuffer = new ContextBuffer({
      saveDir: contextBufferDir,
      maxFiles: 10,
      enabled: !this.options.enableConsciousness
    });

    // 初始化意识体组件（Stage 8）
    if (this.options.enableConsciousness) {
      const memoryDir = join(this.options.workspacePath, '.tramber', 'memory');
      this.memoryStore = new MemoryStore({ rootDir: memoryDir });
      this.contextStorage = new ContextStorage({
        rootDir: contextBufferDir,
        maxSnapshotsPerTask: 20,
        enabled: true
      });
      this.consciousnessManager = new ConsciousnessManager({
        agentId: 'tramber-agent',
        memoryStore: this.memoryStore,
        contextStorage: this.contextStorage,
        maxIterations: 30
      });
      debug(NAMESPACE.CONSCIOUSNESS, LogLevel.BASIC, 'Consciousness system initialized');
    }

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
      this.provider = providerFactory.create({
        type: this.options.provider ?? 'anthropic',
        apiKey: this.options.apiKey,
        model: this.options.model,
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
      // 统一 taskId：优先用已有 conversation.id，否则预生成一个
      // 避免第一轮用 task-xxx 后续轮用 conv-xxx 导致 context 目录不一致
      const taskId = this.currentTaskId ?? conversation?.id ?? generateId('conv');
      const task: Task = {
        id: taskId,
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
        maxIterations: options.maxIterations ?? 10,
        consciousness: !!this.consciousnessManager
      });

      // 意识体模式：注册虚拟工具并使用意识体 prompt
      let rootState: SelfAwarenessState | undefined;
      if (this.consciousnessManager) {
        const cm = this.consciousnessManager;
        // 首轮创建 root，后续轮复用已有 root（保留领域子意识树）
        rootState = cm.getRoot() ?? cm.createRoot(
          task.id,
          description,
          options.sceneId ?? 'coding'
        );

        // 创建虚拟工具上下文
        const virtualToolCtx: VirtualToolContext = {
          consciousnessManager: cm,
          createLoop: (childOpts) => {
            const childRegistry = new ToolRegistryImpl();
            childRegistry.register(readFileTool);
            childRegistry.register(writeFileTool);
            childRegistry.register(editFileTool);
            childRegistry.register(globTool);
            childRegistry.register(grepTool);
            childRegistry.register(execTool);
            // 子意识也注册审批和报告（用 Object.create 共享父 context，currentSubtaskId 通过原型链传递）
            const childCtx: VirtualToolContext = Object.create(virtualToolCtx);
            childCtx.createLoop = () => { throw new Error('Nested child creation not supported'); };
            childCtx.currentConsciousnessId = 'child';
            registerVirtualTools(childRegistry, childCtx, 'execution');

            return new AgentLoop({
              agent: {
                id: 'tramber-agent',
                name: 'Tramber',
                description: 'AI Assisted Programming Assistant',
                sceneId: options.sceneId ?? 'coding',
                temperature: 0.7,
                maxTokens: 16384
              },
              provider: this.provider!,
              toolRegistry: childRegistry,
              permissionChecker: this.permissionChecker,
              maxIterations: childOpts.maxIterations ?? 10,
              stream: options.stream,
              onPermissionRequired: options.onPermissionRequired,
              userSkills: this.userSkillRegistry.getEnabled(),
              contextBuffer: this.contextBuffer,
              // 子意识的输出：转发 LLM 文本（流式 content 和非流式 thinking），不转发工具进度
              onStep: (step) => {
                if (!step.toolCall && !step.toolResult) {
                  const text = step.content || step.thinking;
                  if (text) onProgress({ type: 'text_delta', content: text });
                }
              }


            });
          },
          currentConsciousnessId: 'root',
          onPermissionRequired: options.onPermissionRequired
        };

        // 注册虚拟工具到主 registry
        registerVirtualTools(this.toolRegistry, virtualToolCtx, 'self_awareness');

        // 通知前端意识体状态
        onProgress({
          type: 'consciousness',
          consciousness: {
            id: 'root',
            level: 'self_awareness',
            status: 'thinking',
            taskDescription: description
          }
        });
      }

      const agentLoop = this.agentLoopFactory({
        agent: {
          id: 'tramber-agent',
          name: 'Tramber',
          description: 'AI Assisted Programming Assistant',
          sceneId: options.sceneId ?? 'coding',
          temperature: 0.7,
          maxTokens: 16384
        },
        provider: this.provider!,
        toolRegistry: this.toolRegistry,
        permissionChecker: this.permissionChecker,
        maxIterations: options.maxIterations ?? 30,
        stream: options.stream,
        onPermissionRequired: options.onPermissionRequired,
        userSkills: this.userSkillRegistry.getEnabled(),
        consciousnessState: rootState,
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
          // 意识体模式下，守护意识的文本输出不发送给用户（只有 dispatch_task 结果才转发）
          if (options.stream && step.content && !step.thinking && !this.consciousnessManager) {
            onProgress({
              type: 'text_delta',
              iteration: step.iteration,
              content: step.content
            });
            return;
          }

          // 发送普通步骤进度（只有没有 toolCall/toolResult 时才发送）
          // 意识体模式下，守护意识的文本输出不发送给用户
          if ((step.thinking || step.content) && !this.consciousnessManager) {
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

      // 锁定 taskId：首轮用预生成的 conv-xxx，不再被 result.conversation.id 覆盖
      // 这样多轮对话始终使用同一个目录
      if (!this.currentTaskId) {
        this.currentTaskId = task.id;
      }

      debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'Task execution completed', {
        success: result.success,
        iterations: result.iterations,
        terminatedReason: result.terminatedReason
      });

      // 意识体模式：清理 conversation 并 finalize
      if (this.consciousnessManager) {
        const cm = this.consciousnessManager;

        // 1. 重建系统提示词（反映当前领域状态）
        result.conversation.systemPrompt = cm.buildGuardianPrompt();

        // 2. 清理消息：只保留每个 turn 的最终分析总结
        // 通过 msg.toolNames 标识工具结果：有 toolNames → 工具返回（assistant 是中间消息）
        // 无 toolNames → 原始用户输入（之前的 assistant 是最终总结）
        const cleanedMessages: typeof result.conversation.messages = [];
        let pendingAssistant: typeof result.conversation.messages[0] | null = null;

        for (const msg of result.conversation.messages) {
          if (msg.role === 'assistant') {
            pendingAssistant = msg;
          } else if (msg.role === 'user') {
            if (msg.toolNames && msg.toolNames.length > 0) {
              // 工具结果 → 之前的 assistant 是中间消息，丢弃
              pendingAssistant = null;
            } else {
              // 原始用户输入 → 之前的 assistant 是上一轮的最终总结
              if (pendingAssistant) {
                cleanedMessages.push(pendingAssistant);
                pendingAssistant = null;
              }
            }
          }
        }
        // 最后一个 assistant（本轮最终总结）
        if (pendingAssistant) {
          cleanedMessages.push(pendingAssistant);
        }

        result.conversation.messages = cleanedMessages;

        // 2.5 刷新守护意识 memoryIndex（从实体图谱组装，替代 memory entries）
        const rootState = cm.getRoot();
        if (rootState && this.currentTaskId) {
          rootState.memoryIndex = cm.buildMemoryFromEntities(this.currentTaskId);
        }

        debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'Guardian conversation cleaned', {
          keptMessages: result.conversation.messages.length,
          domainCount: Object.keys(cm.getRoot()?.domains ?? {}).length
        });

        // 3. 用 engine 的 currentTaskId 确保 context 存入同一目录
        const finalTaskId = this.currentTaskId ?? task.id;
        const fullMessages: Array<{ role: string; content: string }> = [
          { role: 'system', content: result.conversation.systemPrompt },
          ...result.conversation.messages.map(m => ({ role: m.role, content: m.content }))
        ];
        cm.finalize(fullMessages, result.success, finalTaskId);
        unregisterVirtualTools(this.toolRegistry);
      }

      // 记录经验
      if (result.success && this.options.enableExperience) {
        debug(NAMESPACE.EXPERIENCE_MANAGER, LogLevel.TRACE, 'Recording successful experience');
        // TODO: 记录成功经验
      }

      return {
        success: result.success,
        result: this.consciousnessManager ? undefined : (result.success ? result.finalAnswer : undefined),
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
    const shouldReinitProvider = options.apiKey || options.baseURL || options.provider;
    Object.assign(this.options, options);

    // 如果更新了 API Key / baseURL / provider，重新初始化 Provider
    if (shouldReinitProvider && this.options.apiKey) {
      this.provider = providerFactory.create({
        type: this.options.provider ?? 'anthropic',
        apiKey: this.options.apiKey,
        model: this.options.model,
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
