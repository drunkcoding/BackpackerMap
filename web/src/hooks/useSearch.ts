import { useEffect, useRef, useState } from 'react';
import { api, type ApiCandidate } from '../api';
import { hasSignificantBBoxChange, type BBox } from '../lib/bboxHysteresis';
import { filtersToSearchParams, filtersFingerprint, type FilterState } from '../lib/searchQuery';

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; candidates: ApiCandidate[]; cached: boolean; warnings: Array<{ provider: string; message: string }> }
  | { status: 'error'; error: Error };

export interface UseSearchOptions {
  enabled: boolean;
  bbox: BBox | null;
  filters: FilterState;
  debounceMs?: number;
  bboxHysteresisThreshold?: number;
}

export function useSearch(opts: UseSearchOptions): SearchState {
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const lastBboxRef = useRef<BBox | null>(null);
  const lastFingerprintRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const debounceMs = opts.debounceMs ?? 300;
  const threshold = opts.bboxHysteresisThreshold ?? 0.2;
  const fingerprint = filtersFingerprint(opts.filters);

  useEffect(() => {
    if (!opts.enabled || !opts.bbox) {
      setState({ status: 'idle' });
      return;
    }

    const bboxChanged = hasSignificantBBoxChange(lastBboxRef.current, opts.bbox, threshold);
    const filtersChanged = fingerprint !== lastFingerprintRef.current;
    if (!bboxChanged && !filtersChanged) return;

    const bbox = opts.bbox;
    const filters = opts.filters;

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastBboxRef.current = bbox;
      lastFingerprintRef.current = fingerprint;

      setState({ status: 'loading' });
      const params = filtersToSearchParams(bbox, filters);
      api
        .search(params, controller.signal)
        .then((resp) => {
          if (controller.signal.aborted) return;
          setState({
            status: 'success',
            candidates: resp.candidates,
            cached: resp.cached,
            warnings: resp.warnings,
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: 'error',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [opts.enabled, opts.bbox, fingerprint, debounceMs, threshold, opts.filters]);

  return state;
}
