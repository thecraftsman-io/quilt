import { Platform } from 'react-native';
import { authClient } from './auth-client';
import { getBaseUrl } from './base-url';
import { createFinanceApi } from './finance-api';

export const financeApi = createFinanceApi({
  baseUrl: getBaseUrl(),
  headers: async () => {
    const headers: Record<string, string> = {};
    if (Platform.OS !== 'web') headers.Cookie = await authClient.getCookie();
    return headers;
  },
});
