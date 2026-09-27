import { gcj02ToWgs84, wgs84ToGcj02, inChina } from '../search/coords.ts';
import {
  NoRoutableRouteError,
  type DrivingDistance,
  type LatLng,
  type RouteGeometry,
} from './ors.ts';

export interface RoutingClient {
  getDrivingDistance(from: LatLng, to: LatLng): Promise<DrivingDistance>;
}

export class AmapRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmapRouteError';
  }
}

export interface AmapRouterOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

interface AmapStep {
  polyline?: string;
}
interface AmapPath {
  distance?: string;
  duration?: string;
  steps?: AmapStep[];
}
interface AmapDirectionResponse {
  status?: string;
  info?: string;
  route?: { paths?: AmapPath[] };
}

function parseGeometry(steps: AmapStep[]): RouteGeometry | null {
  const out: RouteGeometry = [];
  for (const step of steps) {
    if (typeof step.polyline !== 'string' || !step.polyline) continue;
    for (const pair of step.polyline.split(';')) {
      const [lngStr, latStr] = pair.split(',');
      const glng = Number(lngStr);
      const glat = Number(latStr);
      if (!Number.isFinite(glng) || !Number.isFinite(glat)) continue;
      out.push(gcj02ToWgs84(glng, glat));
    }
  }
  return out.length > 0 ? out : null;
}

export function createAmapRouter(options: AmapRouterOptions): RoutingClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const endpoint = options.endpoint ?? 'https://restapi.amap.com/v3/direction/driving';

  async function getDrivingDistance(from: LatLng, to: LatLng): Promise<DrivingDistance> {
    const [oLng, oLat] = wgs84ToGcj02(from.lng, from.lat);
    const [dLng, dLat] = wgs84ToGcj02(to.lng, to.lat);
    const u = new URL(endpoint);
    u.searchParams.set('key', options.apiKey);
    u.searchParams.set('origin', `${oLng.toFixed(6)},${oLat.toFixed(6)}`);
    u.searchParams.set('destination', `${dLng.toFixed(6)},${dLat.toFixed(6)}`);
    u.searchParams.set('extensions', 'all');

    const res = await fetchImpl(u.toString());
    if (!res.ok) throw new AmapRouteError(`amap direction HTTP ${res.status}`);
    const body = (await res.json()) as AmapDirectionResponse;
    if (body.status !== '1') {
      throw new AmapRouteError(`amap direction error: ${body.info ?? 'unknown'}`);
    }
    const path = body.route?.paths?.[0];
    if (!path || path.distance === undefined || path.duration === undefined) {
      throw new NoRoutableRouteError('amap returned no drivable path');
    }
    const meters = Number(path.distance);
    const seconds = Number(path.duration);
    if (!Number.isFinite(meters) || !Number.isFinite(seconds)) {
      throw new AmapRouteError('amap path distance/duration not numeric');
    }
    return { meters, seconds, geometry: parseGeometry(path.steps ?? []) };
  }

  return { getDrivingDistance };
}

export function createRegionRoutingClient(deps: {
  ors: RoutingClient;
  amap: RoutingClient;
}): RoutingClient {
  return {
    async getDrivingDistance(from: LatLng, to: LatLng): Promise<DrivingDistance> {
      if (inChina(from.lng, from.lat) && inChina(to.lng, to.lat)) {
        return deps.amap.getDrivingDistance(from, to);
      }
      return deps.ors.getDrivingDistance(from, to);
    },
  };
}
