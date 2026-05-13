import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'bpm:visiblePoiCollections';

function load(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function persist(value: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...value]));
  } catch {
    void 0;
  }
}

export interface UseVisibleCollectionsResult {
  visible: Set<string>;
  isVisible: (collection: string) => boolean;
  toggle: (collection: string) => void;
  setVisible: (collection: string, visible: boolean) => void;
}

export function useVisibleCollections(): UseVisibleCollectionsResult {
  const [visible, setVisibleState] = useState<Set<string>>(load);

  useEffect(() => {
    persist(visible);
  }, [visible]);

  const isVisible = useCallback((collection: string) => visible.has(collection), [visible]);

  const toggle = useCallback((collection: string) => {
    setVisibleState((prev) => {
      const next = new Set(prev);
      if (next.has(collection)) next.delete(collection);
      else next.add(collection);
      return next;
    });
  }, []);

  const setVisible = useCallback((collection: string, shouldShow: boolean) => {
    setVisibleState((prev) => {
      if (prev.has(collection) === shouldShow) return prev;
      const next = new Set(prev);
      if (shouldShow) next.add(collection);
      else next.delete(collection);
      return next;
    });
  }, []);

  return { visible, isVisible, toggle, setVisible };
}
