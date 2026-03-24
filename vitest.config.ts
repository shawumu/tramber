// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@tramber/shared': resolve(__dirname, 'packages/shared/src'),
      '@tramber/tool': resolve(__dirname, 'packages/tool/src'),
      '@tramber/permission': resolve(__dirname, 'packages/permission/src'),
      '@tramber/provider': resolve(__dirname, 'packages/provider/src'),
      '@tramber/agent': resolve(__dirname, 'packages/agent/src'),
      '@tramber/scene': resolve(__dirname, 'packages/scene/src'),
      '@tramber/routine': resolve(__dirname, 'packages/routine/src'),
      '@tramber/experience': resolve(__dirname, 'packages/experience/src'),
      '@tramber/sdk': resolve(__dirname, 'packages/sdk/src')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/*.dist.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts']
    }
  }
});
