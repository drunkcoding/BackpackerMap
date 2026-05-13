import { CircleMarker, Popup } from 'react-leaflet';
import type { ApiPoi } from '../api';

export interface PoiLayerProps {
  pois: ApiPoi[];
}

export function PoiLayer({ pois }: PoiLayerProps) {
  return (
    <>
      {pois.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={6}
          pathOptions={{
            color: '#4A6670',
            fillColor: '#4A6670',
            fillOpacity: 0.85,
            weight: 1.5,
          }}
          className="bpm-poi-marker"
        >
          <Popup>
            <div className="bpm-poi-popup">
              <p className="bpm-poi-name">{p.name}</p>
              {p.note && <p className="bpm-poi-note">{p.note}</p>}
              {p.address && <p className="bpm-poi-address">{p.address}</p>}
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  View on Google Maps →
                </a>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}
