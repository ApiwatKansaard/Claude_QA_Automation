import path from 'path';
import dotenv from 'dotenv';

/**
 * Supported environments — maps to environments/.env.{name}
 */
export type Environment = 'dev' | 'staging' | 'prod' | 'eko-dev';

export type LoginMethod = 'cognito' | 'basic' | 'sso';

export interface EnvConfig {
  env: Environment;
  baseURL: string;
  apiBaseURL: string;
  adminEmail: string;
  adminPassword: string;
  loginMethod: LoginMethod;
  ssoProviderURL: string;
  readonlyMode: boolean;
  authStatePath: string;
}

/**
 * Resolve current environment from TEST_ENV env var.
 * Priority: TEST_ENV → defaults to 'staging'
 */
export function resolveEnv(): Environment {
  const raw = process.env.TEST_ENV?.toLowerCase().trim();
  if (raw === 'dev' || raw === 'development') return 'dev';
  if (raw === 'eko-dev') return 'eko-dev';
  if (raw === 'prod' || raw === 'production') return 'prod';
  return 'staging';
}

/**
 * Load environment config from the matching .env file.
 * Call this once at config load time.
 */
export function loadEnvConfig(env?: Environment): EnvConfig {
  const targetEnv = env || resolveEnv();

  // Load environment-specific .env file
  const envFilePath = path.resolve(__dirname, `../../environments/.env.${targetEnv}`);
  dotenv.config({ path: envFilePath });

  // Also load root .env as fallback (for local overrides / CI secrets)
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  const config: EnvConfig = {
    env: targetEnv,
    baseURL: process.env.BASE_URL || '',
    apiBaseURL: process.env.API_BASE_URL || '',
    adminEmail: process.env.ADMIN_EMAIL || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    loginMethod: (process.env.LOGIN_METHOD as LoginMethod) || 'cognito',
    ssoProviderURL: process.env.SSO_PROVIDER_URL || '',
    readonlyMode: process.env.READONLY_MODE === 'true',
    authStatePath: path.resolve(__dirname, `../../playwright/.auth/${targetEnv}-user.json`),
  };

  // Validate required fields
  if (!config.baseURL) {
    throw new Error(`BASE_URL not set for environment "${targetEnv}". Check environments/.env.${targetEnv}`);
  }
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error(
      `ADMIN_EMAIL and ADMIN_PASSWORD must be set for environment "${targetEnv}". Check environments/.env.${targetEnv}`,
    );
  }

  return config;
}
