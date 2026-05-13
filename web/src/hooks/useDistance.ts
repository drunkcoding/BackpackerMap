import { api, type ApiDistance } from '../api';
import { useFetch, type FetchState } from './useFetch';

export function useDistance(
  propertyId: number | null,
  trailId: number | null,
): FetchState<ApiDistance> {
  return useFetch(
    (signal) => {
      if (propertyId === null || trailId === null) {
        return Promise.reject(new Error('no ids'));
      }
      return api.distance(propertyId, trailId, signal);
    },
    `distance:${propertyId ?? 'null'}:${trailId ?? 'null'}`,
  );
}
