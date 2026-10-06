import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// Shell/deployment and app-local settings take precedence over the root fallback.
// Node's loader leaves existing environment variables unchanged.
const rootEnvironment = fileURLToPath(
  new URL('../../.env.local', import.meta.url),
);
if (existsSync(rootEnvironment)) process.loadEnvFile(rootEnvironment);

const config: NextConfig = {
  agentRules: false,
  turbopack: { root: fileURLToPath(new URL('../..', import.meta.url)) },
};

export default config;
