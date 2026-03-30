// packages/client/cli/src/engine-interface.ts
/**
 * Engine 统一接口
 *
 * TramberEngine（本地）和 RemoteClient（远程）都实现此接口，
 * CLI App 组件无需关心底层是本地还是远程。
 */

import type { ExecuteOptions, TramberResponse } from '@tramber/sdk';
import type { Conversation } from '@tramber/agent';
import type { SkillManifest } from '@tramber/skill';

export interface EngineLike {
  execute(
    description: string,
    options?: ExecuteOptions,
    conversation?: Conversation
  ): Promise<TramberResponse & { conversation?: Conversation }>;

  listUserSkills(): SkillManifest[];
  enableSkill(slug: string): Promise<void>;
  disableSkill(slug: string): Promise<void>;
  close(): Promise<void>;
}
