import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { ActivityIndicator, AppState, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { Button, Card, Text, View, useQuiltTheme } from '@quilt/ui';
import type {
  FinanceRecordMap,
  FinanceResource,
  WorkspaceAccess,
} from '@quilt/contracts';
import { financeApi } from '../../lib/client/finance';
import { ClientError } from '../../lib/client/errors';
import { useAppStore } from '../../state/app-store';

export type FinanceRecords = { [K in FinanceResource]: FinanceRecordMap[K][] };
export type FinanceSnapshot = FinanceRecords & { workspace: WorkspaceAccess };
interface FinanceContextValue {
  data: FinanceSnapshot | null;
  revision: number;
  refresh: () => Promise<void>;
  create: <K extends FinanceResource>(
    resource: K,
    data: unknown,
  ) => Promise<FinanceRecordMap[K]>;
  update: <K extends Exclude<FinanceResource, 'contributions'>>(
    resource: K,
    id: string,
    version: number,
    data: unknown,
  ) => Promise<FinanceRecordMap[K]>;
  transactionState: (
    id: string,
    version: number,
    action: 'void' | 'restore',
    reason: string,
  ) => Promise<FinanceRecordMap['transactions']>;
  uncertain: boolean;
}
const FinanceContext = createContext<FinanceContextValue | null>(null);
export function FinanceProvider({
  children,
  workspaceId,
}: PropsWithChildren<{ workspaceId: string }>) {
  const router = useRouter();
  const { colors } = useQuiltTheme();
  const refreshSession = useAppStore((s) => s.refreshSession);
  const [data, setData] = useState<FinanceSnapshot | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const load = useRef<AbortController | null>(null);
  const operations = useRef(new Map<string, string>());
  const retry = useRef<{ key: string; execute: () => Promise<unknown> } | null>(
    null,
  );
  const [uncertain, setUncertain] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const refresh = useCallback(async () => {
    load.current?.abort();
    const controller = new AbortController();
    load.current = controller;
    try {
      const workspace = await financeApi.access(workspaceId, controller.signal);
      const [
        accounts,
        categories,
        merchants,
        tags,
        budgets,
        goals,
        settings,
        recent,
      ] = await Promise.all([
        financeApi.all(workspaceId, 'accounts', controller.signal),
        financeApi.all(workspaceId, 'categories', controller.signal),
        financeApi.all(workspaceId, 'merchants', controller.signal),
        financeApi.all(workspaceId, 'tags', controller.signal),
        financeApi.all(workspaceId, 'budgets', controller.signal),
        financeApi.all(workspaceId, 'goals', controller.signal),
        financeApi.all(workspaceId, 'settings', controller.signal),
        financeApi.list(
          workspaceId,
          'transactions',
          { limit: 20, offset: 0, voided: 'active' },
          controller.signal,
        ),
      ]);
      if (!controller.signal.aborted && alive.current) {
        setData({
          workspace,
          accounts,
          categories,
          merchants,
          tags,
          budgets,
          goals,
          settings,
          transactions: recent.items,
          contributions: [],
        });
        setError('');
        setRevision((v) => v + 1);
      }
    } catch (cause) {
      if (!controller.signal.aborted && alive.current) {
        setData(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'We couldn’t load this household.',
        );
        if (cause instanceof ClientError && cause.status === 401)
          void refreshSession();
      }
    }
  }, [workspaceId, refreshSession]);
  useEffect(() => {
    alive.current = true;
    queueMicrotask(() => {
      if (alive.current) void refresh();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const focus = () => {
      void refresh();
    };
    if (Platform.OS === 'web') window.addEventListener('focus', focus);
    return () => {
      alive.current = false;
      load.current?.abort();
      subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  async function mutate<K extends FinanceResource>(
    resource: K,
    fingerprint: string,
    execute: (operationId: string) => Promise<FinanceRecordMap[K]>,
  ): Promise<FinanceRecordMap[K]> {
    if (retry.current && retry.current.key !== fingerprint)
      throw new ClientError(
        'Confirm the previous save using the banner before making another change.',
      );
    let operationId = operations.current.get(fingerprint);
    if (!operationId) {
      operationId = Crypto.randomUUID();
      operations.current.set(fingerprint, operationId);
    }
    try {
      const record = await execute(operationId);
      operations.current.delete(fingerprint);
      retry.current = null;
      if (alive.current) {
        setUncertain(false);
        setData((current) =>
          current
            ? {
                ...current,
                [resource]: [
                  record,
                  ...current[resource].filter((item) => item.id !== record.id),
                ],
              }
            : current,
        );
        setRevision((v) => v + 1);
      }
      return record;
    } catch (cause) {
      if (cause instanceof ClientError && cause.status === 0) {
        retry.current = {
          key: fingerprint,
          execute: () => mutate(resource, fingerprint, execute),
        };
        if (alive.current) setUncertain(true);
      }
      if (!(cause instanceof ClientError && cause.status === 0)) {
        operations.current.delete(fingerprint);
        if (retry.current?.key === fingerprint) {
          retry.current = null;
          if (alive.current) setUncertain(false);
        }
      }
      if (
        cause instanceof ClientError &&
        [401, 403, 404].includes(cause.status)
      )
        void refresh();
      throw cause;
    }
  }
  const value: FinanceContextValue = {
    data,
    revision,
    refresh,
    uncertain,
    create: (resource, payload) =>
      mutate(
        resource,
        JSON.stringify(['create', resource, payload]),
        (operationId) =>
          financeApi.create(workspaceId, resource, payload, operationId),
      ),
    update: (resource, id, version, payload) =>
      mutate(
        resource,
        JSON.stringify(['update', resource, id, version, payload]),
        (operationId) =>
          financeApi.update(
            workspaceId,
            resource,
            id,
            version,
            payload,
            operationId,
          ),
      ),
    transactionState: (id, version, action, reason) =>
      mutate(
        'transactions',
        JSON.stringify([action, id, version, reason]),
        (operationId) =>
          financeApi.transactionState(
            workspaceId,
            id,
            version,
            action,
            reason,
            operationId,
          ),
      ),
  };
  return (
    <FinanceContext.Provider value={value}>
      {data ? (
        <>
          {uncertain && (
            <Card className="m-4">
              <Text role="alert">
                The last save wasn’t confirmed. Check its result before making
                another change.
              </Text>
              <Button
                label="Confirm last save"
                loading={retrying}
                onPress={() => {
                  if (!retry.current) return;
                  setRetrying(true);
                  void retry.current
                    .execute()
                    .then(() => refresh())
                    .catch(() => {})
                    .finally(() => {
                      if (alive.current) setRetrying(false);
                    });
                }}
              />
            </Card>
          )}
          {children}
        </>
      ) : (
        <View className="flex-1 items-center justify-center bg-background p-6 gap-4">
          {error ? (
            <>
              <Text role="alert" tone="danger">
                {error}
              </Text>
              <Button
                label="Try again"
                onPress={() => {
                  void refresh();
                }}
              />
              <Button
                label="Back to households"
                variant="secondary"
                onPress={() => router.push('/households')}
              />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text tone="textMuted">Opening your household…</Text>
            </>
          )}
        </View>
      )}
    </FinanceContext.Provider>
  );
}
export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context?.data) throw new Error('A loaded FinanceProvider is required.');
  return {
    ...context,
    data: context.data,
    workspaceId: context.data.workspace.id,
    canEdit: context.data.workspace.role !== 'viewer' && !context.uncertain,
    isOwner: context.data.workspace.role === 'owner' && !context.uncertain,
  };
}
