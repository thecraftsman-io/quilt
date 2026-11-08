import { createAuthClient } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';
import { ownerAc, memberAc } from 'better-auth/plugins/organization/access';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { getBaseUrl } from './base-url';

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  fetchOptions: { timeout: 15000 },
  plugins: [
    organizationClient({
      roles: { owner: ownerAc, editor: memberAc, viewer: memberAc },
    }),
    expoClient({
      scheme: 'quilt',
      storagePrefix: 'quilt',
      storage: SecureStore,
      disableCache: true,
    }),
  ],
});

export type RawAuthClient = typeof authClient;
