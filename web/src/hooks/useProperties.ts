import { api, type ApiProperty } from '../api';
import { useFetch, type FetchState } from './useFetch';

export function useProperties(version = 0): FetchState<ApiProperty[]> {
  return useFetch(() => api.properties(), `properties:${version}`);
}
