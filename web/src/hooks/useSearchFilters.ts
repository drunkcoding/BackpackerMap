import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_FILTERS, type FilterState } from '../lib/searchQuery';

const URL_KEY = 'q';

function decodeFromUrl(): FilterState {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(URL_KEY);
  if (!raw) return DEFAULT_FILTERS;
  try {
    const parsed = JSON.parse(atob(raw)) as Partial<FilterState>;
    return { ...DEFAULT_FILTERS, ...parsed };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function encodeToUrl(filters: FilterState): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const encoded = btoa(JSON.stringify(filters));
  params.set(URL_KEY, encoded);
  const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, '', newUrl);
}

export interface UseSearchFiltersResult {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  reset: () => void;
}

export function useSearchFilters(): UseSearchFiltersResult {
  const [filters, setFilters] = useState<FilterState>(() => decodeFromUrl());

  useEffect(() => {
    encodeToUrl(filters);
  }, [filters]);

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  return { filters, setFilter, reset };
}
