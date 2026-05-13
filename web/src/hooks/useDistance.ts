import { api, type ApiDistance, type ApiTargetKind } from '../api';
import { useFetch, type FetchState } from './useFetch';

export function useDistance(
  propertyId: number | null,
  targetKind: ApiTargetKind,
  targetId: number | null,
): FetchState<ApiDistance> {
  return useFetch(
    (signal) => {
      if (propertyId === null || targetId === null) {
        return Promise.reject(new Error('no ids'));
      }
      return api.distance(propertyId, targetKind, targetId, signal);
    },
    `distance:${propertyId ?? 'null'}:${targetKind}:${targetId ?? 'null'}`,
  );
}
