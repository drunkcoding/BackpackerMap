import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { Marker } from 'react-leaflet';
import type { ApiCandidate, ApiProperty } from '../api';
import { HouseAirbnb } from '../icons/HouseAirbnb';
import { HouseBooking } from '../icons/HouseBooking';
import { escapeHtml } from '../lib/escapeHtml';

export function candidateDivIcon(
  provider: 'airbnb' | 'booking',
  priceLabel: string | null,
): L.DivIcon {
  const iconSvg = renderToStaticMarkup(provider === 'airbnb' ? <HouseAirbnb /> : <HouseBooking />);
  const priceHtml = priceLabel
    ? `<span class="bpm-marker__price">${escapeHtml(priceLabel)}</span>`
    : '';
  const html = `<div class="bpm-marker bpm-marker--${provider} bpm-marker--candidate"><span class="bpm-marker__icon">${iconSvg}</span>${priceHtml}</div>`;
  const width = priceLabel ? 96 : 28;
  const height = priceLabel ? 48 : 28;
  return L.divIcon({
    html,
    className: '',
    iconSize: [width, height],
    iconAnchor: [width / 2, 14],
  });
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
  const savedKeys = new Set(savedProperties.map((p) => `${p.provider}:${p.externalId}`));
  const visible = candidates.filter((c) => !savedKeys.has(`${c.provider}:${c.externalId}`));

  return (
    <>
      {visible.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={candidateDivIcon(c.provider, c.priceLabel)}
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
