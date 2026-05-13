import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { Marker } from 'react-leaflet';
import type { ApiCandidate, ApiProperty } from '../api';
import { HouseAirbnb } from '../icons/HouseAirbnb';
import { HouseBooking } from '../icons/HouseBooking';

function candidateDivIcon(provider: 'airbnb' | 'booking'): L.DivIcon {
  const icon = provider === 'airbnb' ? <HouseAirbnb /> : <HouseBooking />;
  const html = renderToStaticMarkup(
    <div className={`bpm-marker bpm-marker--${provider} bpm-marker--candidate`}>{icon}</div>,
  );
  return L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
}

export interface CandidateLayerProps {
  candidates: ApiCandidate[];
  savedProperties: ApiProperty[];
  onSelectCandidate: (id: number | null) => void;
}

export function CandidateLayer({
  candidates,
  savedProperties,
  onSelectCandidate,
}: CandidateLayerProps) {
  const savedKeys = new Set(
    savedProperties.map((p) => `${p.provider}:${p.externalId}`),
  );
  const visible = candidates.filter((c) => !savedKeys.has(`${c.provider}:${c.externalId}`));

  return (
    <>
      {visible.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={candidateDivIcon(c.provider)}
          eventHandlers={{ click: () => onSelectCandidate(c.id) }}
        />
      ))}
    </>
  );
}

export function filterUnsavedCandidates(
  candidates: ApiCandidate[],
  savedProperties: Array<{ provider: 'airbnb' | 'booking'; externalId: string }>,
): ApiCandidate[] {
  const savedKeys = new Set(savedProperties.map((p) => `${p.provider}:${p.externalId}`));
  return candidates.filter((c) => !savedKeys.has(`${c.provider}:${c.externalId}`));
}
