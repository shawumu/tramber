// packages/shared/src/types/experience.ts
/**
 * Experience 相关类型定义 - 全维度经验系统
 */

export type ExperienceType = 'success' | 'failure' | 'pattern' | 'anti-pattern';
export type ExperienceTarget = 'scene' | 'workflow' | 'skill' | 'routine' | 'tool';
export type ExperienceCategory = 'installation' | 'usage' | 'configuration' | 'troubleshooting' | 'optimization';

export interface Experience {
  id: string;
  name: string;
  description: string;

  // 经验类型和目标
  type: ExperienceType;
  target: ExperienceTarget;
  targetId: string;

  // 经验分类
  category: ExperienceCategory;

  // 内容
  content: ExperienceContent;

  // 元数据
  tags: string[];
  confidence: number;
  effectiveness?: number;
  frequency: number;

  // 来源
  source: ExperienceSource;

  // 时间戳
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;

  // 检索方法
  relevance(query: string): number;
}

export interface ExperienceContent {
  problem: string;
  solution: string;
  codeExample?: string;
  keyPoints: string[];
  caveats?: string[];

  // 安装相关
  installCommand?: string;
  installNotes?: string;
  prerequisites?: string[];
  conflicts?: string[];

  // 使用相关
  usageExample?: string;
  bestPractices?: string[];

  // 配置相关
  configExample?: string;
  configOptions?: Record<string, { description: string; recommended: string }>;

  // 故障排除
  errorPattern?: string;
  errorSolution?: string;

  // 优化建议
  optimizationTip?: string;
}

export interface ExperienceSource {
  type: 'ai_generated' | 'user_reported' | 'community_contributed';
  userId?: string;
  sessionId?: string;
}

export interface ExperienceQuery {
  target: ExperienceTarget;
  targetId?: string;
  text: string;
  category?: ExperienceCategory;
  type?: ExperienceType;
  limit?: number;
}

export interface ExperienceBatch {
  target: ExperienceTarget;
  targetId: string;
  experiences: Omit<Experience, 'id' | 'createdAt' | 'updatedAt'>[];
}

export interface ExperienceStats {
  target: ExperienceTarget;
  targetId: string;
  totalExperiences: number;
  byType: Record<ExperienceType, number>;
  byCategory: Record<string, number>;
  averageEffectiveness: number;
  mostUsed: Experience[];
}
