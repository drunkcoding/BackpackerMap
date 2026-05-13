import {
  ProviderNotImplementedError,
  type ProviderResult,
  type SearchProvider,
  type SearchQuery,
} from '../types.ts';

export class BookingDemandApiProvider implements SearchProvider {
  readonly name = 'booking-demand-api';
  readonly provider = 'booking' as const;

  constructor(_opts: { affiliateId?: string; apiToken?: string } = {}) {
    void _opts;
  }

  async search(_query: SearchQuery): Promise<ProviderResult[]> {
    void _query;
    throw new ProviderNotImplementedError(this.name);
  }
}
