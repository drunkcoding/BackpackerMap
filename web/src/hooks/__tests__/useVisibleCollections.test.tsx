import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useVisibleCollections } from '../useVisibleCollections';

describe('useVisibleCollections', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to an empty visible set (no collections selected)', () => {
    const { result } = renderHook(() => useVisibleCollections());
    expect(result.current.visible.size).toBe(0);
    expect(result.current.isVisible('Dolomites')).toBe(false);
  });

  it('toggle adds a collection on first call and removes on second', () => {
    const { result } = renderHook(() => useVisibleCollections());
    act(() => result.current.toggle('Dolomites'));
    expect(result.current.isVisible('Dolomites')).toBe(true);
    act(() => result.current.toggle('Dolomites'));
    expect(result.current.isVisible('Dolomites')).toBe(false);
  });

  it('setVisible(name, true) adds; setVisible(name, false) removes', () => {
    const { result } = renderHook(() => useVisibleCollections());
    act(() => result.current.setVisible('A', true));
    act(() => result.current.setVisible('B', true));
    expect(result.current.isVisible('A')).toBe(true);
    expect(result.current.isVisible('B')).toBe(true);
    act(() => result.current.setVisible('A', false));
    expect(result.current.isVisible('A')).toBe(false);
    expect(result.current.isVisible('B')).toBe(true);
  });

  it('persists across hook remounts via localStorage', () => {
    const { result, unmount } = renderHook(() => useVisibleCollections());
    act(() => result.current.toggle('Dolomites'));
    unmount();

    const { result: result2 } = renderHook(() => useVisibleCollections());
    expect(result2.current.isVisible('Dolomites')).toBe(true);
  });

  it('tolerates corrupt localStorage payloads (resets to empty)', () => {
    window.localStorage.setItem('bpm:visiblePoiCollections', 'not-json');
    const { result } = renderHook(() => useVisibleCollections());
    expect(result.current.visible.size).toBe(0);
  });

  it('tolerates non-array JSON in localStorage (resets to empty)', () => {
    window.localStorage.setItem('bpm:visiblePoiCollections', '{"a":1}');
    const { result } = renderHook(() => useVisibleCollections());
    expect(result.current.visible.size).toBe(0);
  });
});
