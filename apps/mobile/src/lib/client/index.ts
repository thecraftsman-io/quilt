import { authClient } from './auth-client';
import { createAuthApi } from './auth';
import { createHouseholdsApi } from './households';
import { getBaseUrl } from './base-url';

export { ClientError } from './errors';
export { getBaseUrl } from './base-url';
export type { Session } from './auth';
export type { Household } from './households';

export const client = {
  auth: createAuthApi(authClient),
  households: createHouseholdsApi(authClient, getBaseUrl()),
};

export type QuiltClient = typeof client;
