import { amenityIdsFor } from '../amenities.ts';
import type { SearchQuery } from '../types.ts';

const ROOM_TYPE_LABELS: Record<string, string> = {
  entire: 'Entire home/apt',
  private: 'Private room',
  shared: 'Shared room',
  hotel: 'Hotel room',
};

export function buildAirbnbSearchUrl(query: SearchQuery): string {
  const params = new URLSearchParams();

  params.set('ne_lat', String(query.bbox.north));
  params.set('ne_lng', String(query.bbox.east));
  params.set('sw_lat', String(query.bbox.south));
  params.set('sw_lng', String(query.bbox.west));
  params.set('zoom', String(query.zoom));
  params.set('search_by_map', 'true');

  if (query.checkin) params.set('checkin', query.checkin);
  if (query.checkout) params.set('checkout', query.checkout);
  if (query.guests.adults > 0) params.set('adults', String(query.guests.adults));
  if (query.guests.children > 0) params.set('children', String(query.guests.children));
  if (query.guests.infants > 0) params.set('infants', String(query.guests.infants));
  if (query.guests.pets && query.guests.pets > 0) params.set('pets', String(query.guests.pets));

  if (query.priceMin !== undefined) params.set('price_min', String(query.priceMin));
  if (query.priceMax !== undefined) params.set('price_max', String(query.priceMax));
  params.set('currency', query.currency);

  if (query.roomTypes && query.roomTypes.length > 0) {
    for (const t of query.roomTypes) {
      const label = ROOM_TYPE_LABELS[t];
      if (label) params.append('room_types[]', label);
    }
  }
  if (query.freeCancellation) params.set('flexible_cancellation', 'true');
  if (query.minBedrooms !== undefined) params.set('min_bedrooms', String(query.minBedrooms));
  if (query.minBathrooms !== undefined) params.set('min_bathrooms', String(query.minBathrooms));
  if (query.minBeds !== undefined) params.set('min_beds', String(query.minBeds));

  if (query.amenities && query.amenities.length > 0) {
    for (const id of amenityIdsFor('airbnb', query.amenities)) {
      params.append('amenities[]', String(id));
    }
  }

  if (query.hostTypes && query.hostTypes.includes('superhost')) {
    params.set('superhost', 'true');
  }

  return `https://www.airbnb.com/s/homes?${params.toString()}`;
}
