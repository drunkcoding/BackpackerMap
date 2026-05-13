import { useEffect, useRef, useState } from 'react';

export type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

export function useFetch<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  key: string,
): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: 'idle' });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    return () => controller.abort();
  }, [key]);

  return state;
}
