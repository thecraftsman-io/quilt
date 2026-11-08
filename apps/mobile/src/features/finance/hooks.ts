import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { FinanceResource } from '@quilt/contracts';
import { financeApi } from '../../lib/client/finance';
import { ClientError } from '../../lib/client/errors';
import { useFinance } from './finance-context';

export function errorMessage(error: unknown) {
  if (error instanceof ClientError && error.status === 409)
    return `${error.message} Go back and reopen this record before editing again.`;
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? 'Check the form details.';
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const result = await work();
      return alive.current ? result : undefined;
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return { pending, error, run };
}
export function useRemote<T>(
  request: (signal: AbortSignal) => Promise<T>,
  enabled = true,
  keepPrevious = false,
) {
  const { revision } = useFinance();
  const [result, setResult] = useState<{
    request: typeof request;
    revision: number;
    value?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void request(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult({ request, revision, value });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({ request, revision, error: errorMessage(cause) });
      });
    return () => controller.abort();
  }, [request, revision, enabled]);
  const current =
    result?.request === request &&
    (result.revision === revision || keepPrevious)
      ? result
      : undefined;
  return {
    value: current?.value,
    error: current?.error ?? '',
    loading: enabled && !current,
  };
}
export function useRecord<K extends FinanceResource>(resource: K, id?: string) {
  const { workspaceId } = useFinance();
  const load = useCallback(
    (signal: AbortSignal) =>
      financeApi.get(workspaceId, resource, id ?? '', signal),
    [workspaceId, resource, id],
  );
  const remote = useRemote(load, Boolean(id), true);
  return { record: remote.value, loading: remote.loading, error: remote.error };
}
export function workspaceToday(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
