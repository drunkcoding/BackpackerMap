import type { ProviderName, ProviderResult, SearchProvider, SearchQuery } from './types.ts';

export interface DispatchResult {
  results: ProviderResult[];
  warnings: Array<{ provider: string; message: string }>;
  providersRan: string[];
}

export interface SearchDispatcher {
  search(query: SearchQuery): Promise<DispatchResult>;
}

function dedupeKey(r: ProviderResult): string {
  return `${r.provider}:${r.externalId}`;
}

export function createDispatcher(providers: SearchProvider[]): SearchDispatcher {
  return {
    async search(query) {
      const settled = await Promise.allSettled(
        providers.map(async (p) => ({ name: p.name, results: await p.search(query) })),
      );

      const warnings: DispatchResult['warnings'] = [];
      const providersRan: string[] = [];
      const seen = new Map<string, ProviderResult>();

      settled.forEach((s, i) => {
        const provider = providers[i]!;
        providersRan.push(provider.name);
        if (s.status === 'fulfilled') {
          for (const r of s.value.results) {
            const key = dedupeKey(r);
            if (!seen.has(key)) seen.set(key, r);
          }
        } else {
          const message = s.reason instanceof Error ? s.reason.message : String(s.reason);
          warnings.push({ provider: provider.name, message });
        }
      });

      return {
        results: [...seen.values()],
        warnings,
        providersRan,
      };
    },
  };
}

export function filterEnabledProviders(
  all: SearchProvider[],
  enabled: ProviderName[],
): SearchProvider[] {
  return all.filter((p) => enabled.includes(p.provider));
}
