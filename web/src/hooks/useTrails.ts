import { api, type ApiTrail } from '../api';
import { useFetch, type FetchState } from './useFetch';

export function useTrails(): FetchState<ApiTrail[]> {
  return useFetch(() => api.trails(), 'trails');
}
