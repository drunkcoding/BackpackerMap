export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function hasSignificantBBoxChange(
  previous: BBox | null,
  next: BBox,
  threshold = 0.2,
): boolean {
  if (!previous) return true;
  const area = (next.east - next.west) * (next.north - next.south);
  if (area <= 0) return true;
  const dx = Math.max(Math.abs(next.east - previous.east), Math.abs(next.west - previous.west));
  const dy = Math.max(Math.abs(next.north - previous.north), Math.abs(next.south - previous.south));
  const shiftArea = dx * dy;
  return shiftArea / area > threshold;
}
