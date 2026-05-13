import { useCallback, useState } from 'react';
import type { ApiGeocodeResult } from '../api';
import { api } from '../api';
import type { GeoJsonGeometry } from '../lib/pointInPolygon';

export interface LocationSelection {
  selected: ApiGeocodeResult | null;
  polygon: GeoJsonGeometry | null;
  polygonLoading: boolean;
  select: (result: ApiGeocodeResult) => void;
  clear: () => void;
}

export function useLocationSelection(): LocationSelection {
  const [selected, setSelected] = useState<ApiGeocodeResult | null>(null);
  const [polygon, setPolygon] = useState<GeoJsonGeometry | null>(null);
  const [polygonLoading, setPolygonLoading] = useState(false);

  const select = useCallback((result: ApiGeocodeResult) => {
    setSelected(result);
    setPolygon(null);
    if (!result.hasPolygon) return;

    setPolygonLoading(true);
    api
      .geocodePolygon(result.osmType, result.osmId)
      .then((resp) => setPolygon(resp.geometry as GeoJsonGeometry))
      .catch(() => setPolygon(null))
      .finally(() => setPolygonLoading(false));
  }, []);

  const clear = useCallback(() => {
    setSelected(null);
    setPolygon(null);
    setPolygonLoading(false);
  }, []);

  return { selected, polygon, polygonLoading, select, clear };
}
