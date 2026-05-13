import { amenityIdsFor } from '../amenities.ts';
import type { SearchQuery, MealPlan, RoomType } from '../types.ts';

const ROOM_TYPE_HT_ID: Record<RoomType, number | null> = {
  hotel: 204,
  entire: 216,
  private: 218,
  shared: 220,
};

const MEAL_PLAN_CODE: Record<MealPlan, number> = {
  breakfast: 1,
  half_board: 2,
  all_inclusive: 4,
};

export interface NfltFilters {
  classes?: number[];
  htIds?: number[];
  freeCancellation?: boolean;
  reviewScore?: number;
  amenityFacilities?: number[];
  mealPlans?: number[];
}

export function nfltEncode(filters: NfltFilters): string {
  const parts: string[] = [];
  if (filters.classes) {
    for (const c of filters.classes) parts.push(`class=${c}`);
  }
  if (filters.htIds) {
    for (const id of filters.htIds) parts.push(`ht_id=${id}`);
  }
  if (filters.freeCancellation) parts.push('fc=1');
  if (filters.reviewScore !== undefined) {
    parts.push(`review_score=${Math.round(filters.reviewScore * 10)}`);
  }
  if (filters.amenityFacilities) {
    for (const id of filters.amenityFacilities) parts.push(`hotelfacility=${id}`);
  }
  if (filters.mealPlans) {
    for (const m of filters.mealPlans) parts.push(`mealplan=${m}`);
  }
  return parts.join(';');
}

function bboxCenter(query: SearchQuery): { lat: number; lng: number } {
  return {
    lat: (query.bbox.north + query.bbox.south) / 2,
    lng: (query.bbox.east + query.bbox.west) / 2,
  };
}

function bboxRadiusKm(query: SearchQuery): number {
  const dLat = Math.abs(query.bbox.north - query.bbox.south);
  const dLng = Math.abs(query.bbox.east - query.bbox.west);
  const meanLat = ((query.bbox.north + query.bbox.south) / 2) * (Math.PI / 180);
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos(meanLat);
  const halfHeightKm = (dLat * kmPerDegLat) / 2;
  const halfWidthKm = (dLng * kmPerDegLng) / 2;
  return Math.max(halfHeightKm, halfWidthKm);
}

export function buildBookingSearchUrl(query: SearchQuery): string {
  const params = new URLSearchParams();
  const center = bboxCenter(query);
  const radius = bboxRadiusKm(query);

  if (query.checkin) params.set('checkin', query.checkin);
  if (query.checkout) params.set('checkout', query.checkout);
  params.set('group_adults', String(Math.max(1, query.guests.adults)));
  params.set('group_children', String(query.guests.children));
  params.set('no_rooms', '1');
  params.set('selected_currency', query.currency);
  params.set('lang', 'en-gb');

  const htIds: number[] = [];
  if (query.roomTypes) {
    for (const t of query.roomTypes) {
      const id = ROOM_TYPE_HT_ID[t];
      if (id !== null) htIds.push(id);
    }
  }

  const amenityFacilities = query.amenities ? amenityIdsFor('booking', query.amenities) : [];

  const mealPlans = query.mealPlans
    ? query.mealPlans.map((m) => MEAL_PLAN_CODE[m]).filter((v): v is number => v !== undefined)
    : [];

  const nflt = nfltEncode({
    htIds,
    ...(query.freeCancellation !== undefined ? { freeCancellation: query.freeCancellation } : {}),
    ...(query.minRating !== undefined ? { reviewScore: query.minRating } : {}),
    amenityFacilities,
    mealPlans,
  });
  if (nflt) params.set('nflt', nflt);

  const url = new URL('https://www.booking.com/searchresults.html');
  url.search = params.toString();
  url.searchParams.set('latitude', String(center.lat));
  url.searchParams.set('longitude', String(center.lng));
  url.searchParams.set('radius', String(Math.max(1, Math.ceil(radius))));
  return url.toString();
}
