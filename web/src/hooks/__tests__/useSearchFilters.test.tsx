import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSearchFilters } from '../useSearchFilters';

describe('useSearchFilters', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('loads defaults when URL has no q param', () => {
    const { result } = renderHook(() => useSearchFilters());
    expect(result.current.filters.adults).toBe(2);
    expect(result.current.filters.amenities).toEqual([]);
  });

  it('setFilter updates state and URL hash', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setFilter('adults', 4));
    expect(result.current.filters.adults).toBe(4);
    expect(window.location.search).toContain('q=');
  });

  it('restores filters from URL on mount', () => {
    const filters = { adults: 5, amenities: ['wifi'] };
    const encoded = btoa(JSON.stringify(filters));
    window.history.replaceState(null, '', `/?q=${encoded}`);
    const { result } = renderHook(() => useSearchFilters());
    expect(result.current.filters.adults).toBe(5);
    expect(result.current.filters.amenities).toEqual(['wifi']);
  });

  it('reset returns to defaults', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => result.current.setFilter('adults', 7));
    act(() => result.current.reset());
    expect(result.current.filters.adults).toBe(2);
  });
});
