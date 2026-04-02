import fs from 'fs';
import { loadEnvConfig } from '../config/env.config';

/**
 * Cognito stores 3 token types as cookies after browser login:
 *   - idToken     → used by API backend for authorization (contains user claims)
 *   - accessToken → used for Cognito UserPool operations
 *   - refreshToken→ used to renew expired tokens
 *
 * The EkoAI API expects `idToken` in the Authorization header.
 */
type CognitoTokenType = 'idToken' | 'accessToken' | 'refreshToken';

export function getCognitoToken(tokenType: CognitoTokenType = 'idToken'): string {
  const config = loadEnvConfig();
  const authStatePath = config.authStatePath;

  if (!fs.existsSync(authStatePath)) {
    throw new Error(
      `Auth state not found at ${authStatePath}. Run setup first: TEST_ENV=${config.env} npx playwright test --project=setup`,
    );
  }

  const state = JSON.parse(fs.readFileSync(authStatePath, 'utf-8'));
  const cookies: Array<{ name: string; value: string }> = state.cookies || [];
  const match = cookies.find((c) => c.name.includes(tokenType));

  if (!match) {
    throw new Error(
      `Cookie containing "${tokenType}" not found in ${config.env} auth state. Available: ${cookies.map((c) => c.name).join(', ')}`,
    );
  }

  return match.value;
}

/** Convenience: returns { Authorization: 'Bearer <idToken>' } */
export function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getCognitoToken('idToken')}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Returns Basic Auth headers for /_internal/ endpoints.
 * Internal endpoints (trigger, action, cutoff orchestrators) use HTTP Basic Auth,
 * NOT Bearer tokens. Credentials come from env config (ADMIN_EMAIL + ADMIN_PASSWORD)
 * or INTERNAL_API_USER / INTERNAL_API_PASSWORD env vars.
 */
export function getInternalAuthHeaders(): Record<string, string> {
  const config = loadEnvConfig();
  const username = process.env.INTERNAL_API_USER || config.adminEmail;
  const password = process.env.INTERNAL_API_PASSWORD || config.adminPassword;
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json',
  };
}
