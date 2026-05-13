import { api, type ApiPoi } from '../api';
import { useFetch, type FetchState } from './useFetch';

export function usePois(): FetchState<ApiPoi[]> {
  return useFetch(() => api.pois(), 'pois');
}
