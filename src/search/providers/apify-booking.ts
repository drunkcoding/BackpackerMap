import {
  ProviderNotImplementedError,
  type ProviderResult,
  type SearchProvider,
  type SearchQuery,
} from '../types.ts';

export class ApifyBookingProvider implements SearchProvider {
  readonly name = 'apify-booking';
  readonly provider = 'booking' as const;

  constructor(_opts: { apiToken?: string; actorId?: string } = {}) {
    void _opts;
  }

  async search(_query: SearchQuery): Promise<ProviderResult[]> {
    void _query;
    throw new ProviderNotImplementedError(this.name);
  }
}
