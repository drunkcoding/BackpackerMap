import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  GeoJSON,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiPoi, ApiProperty, ApiTrail, ApiTrailDetail } from '../api';
import { api } from '../api';
import { HouseAirbnb } from '../icons/HouseAirbnb';
import { HouseBooking } from '../icons/HouseBooking';
import type { BBox } from '../lib/bboxHysteresis';
import { escapeHtml } from '../lib/escapeHtml';
import type { GeoJsonGeometry } from '../lib/pointInPolygon';
import type { GeoJsonObject } from 'geojson';

export function divIconFor(
  provider: 'airbnb' | 'booking',
  selected: boolean,
  priceLabel: string | null,
): L.DivIcon {
  const iconSvg = renderToStaticMarkup(provider === 'airbnb' ? <HouseAirbnb /> : <HouseBooking />);
  const wrapperClass = `bpm-marker bpm-marker--${provider}${selected ? ' bpm-marker--selected' : ''}`;
  const priceHtml = priceLabel
    ? `<span class="bpm-marker__price">${escapeHtml(priceLabel)}</span>`
    : '';
  const html = `<div class="${wrapperClass}"><span class="bpm-marker__icon">${iconSvg}</span>${priceHtml}</div>`;
  const width = priceLabel ? 96 : 28;
  const height = priceLabel ? 48 : 28;
  return L.divIcon({
    html,
    className: '',
    iconSize: [width, height],
    iconAnchor: [width / 2, 14],
  });
}

export interface MapViewProps {
  trails: ApiTrail[];
  properties: ApiProperty[];
  selectedPropertyId: number | null;
  hoveredTrailId: number | null;
  hoveredPoiCarpark?: { poi: ApiPoi; carpark: { lat: number; lng: number } } | null;
  hoveredRouteGeometry?: [number, number][] | null;
  onSelectProperty: (id: number | null) => void;
  onBoundsChange?: (bbox: BBox) => void;
  flyToBbox?: BBox | null;
  regionPolygon?: GeoJsonGeometry | null;
  children?: ReactNode;
}

function carparkIcon(): L.DivIcon {
  return L.divIcon({
    html: '<div class="bpm-carpark-marker">P</div>',
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function FlyToBbox({ bbox }: { bbox: BBox | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!bbox) return;
    const bounds = L.latLngBounds(L.latLng(bbox.south, bbox.west), L.latLng(bbox.north, bbox.east));
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8 });
  }, [bbox, map]);
  return null;
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
  hoveredPoiCarpark,
  hoveredRouteGeometry,
  onSelectProperty,
  onBoundsChange,
  flyToBbox,
  regionPolygon,
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
          next.set(t.id, {
            ...t,
            externalId: null,
            geojson: { type: 'LineString', coordinates: [] },
          });
        }
      }
      if (!cancelled) setTrailDetails(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [trails]);

  const center: [number, number] = properties[0]
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
        const positions: [number, number][] = detail.geojson.coordinates.map((c) => [
          c[1] as number,
          c[0] as number,
        ]);
        return (
          <Fragment key={t.id}>
            <Polyline
              positions={positions}
              pathOptions={{ color: '#F4EFE5', weight: 6, opacity: 1 }}
            />
            <Polyline
              positions={positions}
              pathOptions={{
                color: '#C2491D',
                weight: 3,
                opacity: 0.95,
                className: 'bpm-trail-core',
              }}
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
          icon={divIconFor(p.provider, p.id === selectedPropertyId, p.priceLabel)}
          eventHandlers={{
            click: () => onSelectProperty(p.id),
          }}
        />
      ))}

      {selected && hoveredTrail && !hoveredRouteGeometry && (
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

      {hoveredRouteGeometry && (
        <Polyline
          positions={hoveredRouteGeometry.map(([lng, lat]) => [lat, lng])}
          pathOptions={{
            color: '#A88847',
            weight: 3,
            opacity: 0.95,
            className: 'bpm-route-line',
          }}
        />
      )}

      {hoveredPoiCarpark && (
        <Fragment>
          <Polyline
            positions={[
              [hoveredPoiCarpark.poi.lat, hoveredPoiCarpark.poi.lng],
              [hoveredPoiCarpark.carpark.lat, hoveredPoiCarpark.carpark.lng],
            ]}
            pathOptions={{
              color: '#7a5a3a',
              weight: 2,
              dashArray: '2 4',
              opacity: 0.9,
              className: 'bpm-carpark-line',
            }}
          />
          <Marker
            position={[hoveredPoiCarpark.carpark.lat, hoveredPoiCarpark.carpark.lng]}
            icon={carparkIcon()}
            interactive={false}
          />
        </Fragment>
      )}

      {regionPolygon && (
        <GeoJSON
          key={JSON.stringify(regionPolygon).slice(0, 80)}
          data={regionPolygon as GeoJsonObject}
          style={{
            color: '#A88847',
            weight: 2,
            opacity: 0.85,
            fillColor: '#C9A661',
            fillOpacity: 0.08,
            dashArray: '4 6',
          }}
        />
      )}
      <FlyToBbox bbox={flyToBbox ?? null} />
      {onBoundsChange && <BoundsTracker onBoundsChange={onBoundsChange} />}
      {children}
    </MapContainer>
  );
}
