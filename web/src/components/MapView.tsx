import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiProperty, ApiTrail, ApiTrailDetail } from '../api';
import { api } from '../api';
import { HouseAirbnb } from '../icons/HouseAirbnb';
import { HouseBooking } from '../icons/HouseBooking';
import type { BBox } from '../lib/bboxHysteresis';

function divIconFor(provider: 'airbnb' | 'booking', selected: boolean): L.DivIcon {
  const icon = provider === 'airbnb' ? <HouseAirbnb /> : <HouseBooking />;
  const html = renderToStaticMarkup(
    <div className={`bpm-marker bpm-marker--${provider}${selected ? ' bpm-marker--selected' : ''}`}>
      {icon}
    </div>,
  );
  return L.divIcon({
    html,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export interface MapViewProps {
  trails: ApiTrail[];
  properties: ApiProperty[];
  selectedPropertyId: number | null;
  hoveredTrailId: number | null;
  onSelectProperty: (id: number | null) => void;
  onBoundsChange?: (bbox: BBox) => void;
  children?: ReactNode;
}

function BoundsTracker({ onBoundsChange }: { onBoundsChange: (bbox: BBox) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onBoundsChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    },
  });
  useEffect(() => {
    const b = map.getBounds();
    onBoundsChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  }, [map, onBoundsChange]);
  return null;
}

export function MapView({
  trails,
  properties,
  selectedPropertyId,
  hoveredTrailId,
  onSelectProperty,
  onBoundsChange,
  children,
}: MapViewProps) {
  const [trailDetails, setTrailDetails] = useState<Map<number, ApiTrailDetail>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = new Map<number, ApiTrailDetail>();
      for (const t of trails) {
        try {
          const detail = await api.trail(t.id);
          if (cancelled) return;
          next.set(t.id, detail);
        } catch {
          next.set(t.id, { ...t, externalId: null, geojson: { type: 'LineString', coordinates: [] } });
        }
      }
      if (!cancelled) setTrailDetails(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [trails]);

  const center: [number, number] =
    properties[0]
      ? [properties[0].lat, properties[0].lng]
      : trails[0]
        ? [trails[0].trailheadLat, trails[0].trailheadLng]
        : [56.7867, -5.0035];

  const selected = properties.find((p) => p.id === selectedPropertyId) ?? null;
  const hoveredTrail = trails.find((t) => t.id === hoveredTrailId) ?? null;

  return (
    <MapContainer
      center={center}
      zoom={8}
      className="bpm-map"
      attributionControl={true}
      preferCanvas={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {trails.map((t) => {
        const detail = trailDetails.get(t.id);
        if (!detail) return null;
        const positions: [number, number][] = detail.geojson.coordinates.map(
          (c) => [c[1] as number, c[0] as number],
        );
        return (
          <Fragment key={t.id}>
            <Polyline positions={positions} pathOptions={{ color: '#F4EFE5', weight: 6, opacity: 1 }} />
            <Polyline
              positions={positions}
              pathOptions={{ color: '#C2491D', weight: 3, opacity: 0.95, className: 'bpm-trail-core' }}
            />
            <CircleMarker
              center={[t.trailheadLat, t.trailheadLng]}
              radius={5}
              pathOptions={{ color: '#C2491D', fillColor: '#F4EFE5', fillOpacity: 1, weight: 1.5 }}
            />
          </Fragment>
        );
      })}

      {properties.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={divIconFor(p.provider, p.id === selectedPropertyId)}
          eventHandlers={{
            click: () => onSelectProperty(p.id),
          }}
        />
      ))}

      {selected && hoveredTrail && (
        <Polyline
          positions={[
            [selected.lat, selected.lng],
            [hoveredTrail.trailheadLat, hoveredTrail.trailheadLng],
          ]}
          pathOptions={{
            color: '#A88847',
            weight: 2,
            dashArray: '4 6',
            opacity: 0.9,
            className: 'bpm-connection-line',
          }}
        />
      )}

      {onBoundsChange && <BoundsTracker onBoundsChange={onBoundsChange} />}
      {children}
    </MapContainer>
  );
}
