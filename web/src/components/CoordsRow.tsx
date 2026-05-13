import { formatCoord } from '../lib/formatCoord';

export function CoordsRow({ lat, lng }: { lat: number; lng: number }) {
  return <p className="bpm-coords">{formatCoord(lat, lng)}</p>;
}
