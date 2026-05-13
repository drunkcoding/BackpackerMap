import { describe, expect, it } from 'vitest';
import { filterUnsavedCandidates } from '../CandidateLayer';
import type { ApiCandidate } from '../../api';

const candidate = (over: Partial<ApiCandidate> = {}): ApiCandidate => ({
  id: 1,
  provider: 'airbnb',
  externalId: '1',
  name: 'x',
  url: '',
  lat: 0,
  lng: 0,
  priceLabel: null,
  priceAmount: null,
  currency: null,
  photoUrl: null,
  rating: null,
  reviewCount: null,
  ...over,
});

describe('filterUnsavedCandidates', () => {
  it('removes candidates that match a saved property by (provider, externalId)', () => {
    const candidates = [
      candidate({ id: 1, externalId: 'a' }),
      candidate({ id: 2, externalId: 'b' }),
    ];
    const saved = [{ provider: 'airbnb' as const, externalId: 'a' }];
    const out = filterUnsavedCandidates(candidates, saved);
    expect(out).toHaveLength(1);
    expect(out[0]!.externalId).toBe('b');
  });

  it('matches across providers independently', () => {
    const candidates = [
      candidate({ id: 1, provider: 'airbnb', externalId: 'x' }),
      candidate({ id: 2, provider: 'booking', externalId: 'x' }),
    ];
    const saved = [{ provider: 'airbnb' as const, externalId: 'x' }];
    const out = filterUnsavedCandidates(candidates, saved);
    expect(out).toHaveLength(1);
    expect(out[0]!.provider).toBe('booking');
  });

  it('empty saved list returns all candidates', () => {
    const candidates = [candidate({ id: 1 }), candidate({ id: 2, externalId: '2' })];
    expect(filterUnsavedCandidates(candidates, [])).toHaveLength(2);
  });
});
