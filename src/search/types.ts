export type ProviderName = 'airbnb' | 'booking';

export type RoomType = 'entire' | 'private' | 'shared' | 'hotel';
export type MealPlan = 'breakfast' | 'half_board' | 'all_inclusive';
export type HostType = 'superhost' | 'individual' | 'professional';

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GuestCounts {
  adults: number;
  children: number;
  infants: number;
  pets?: number;
}

export interface SearchQuery {
  bbox: BBox;
  zoom: number;
  checkin: string | null;
  checkout: string | null;
  guests: GuestCounts;
  priceMin?: number;
  priceMax?: number;
  currency: string;
  roomTypes?: RoomType[];
  freeCancellation?: boolean;
  minBedrooms?: number;
  minBathrooms?: number;
  minBeds?: number;
  minRating?: number;
  amenities?: string[];
  mealPlans?: MealPlan[];
  neighbourhoods?: string[];
  hostTypes?: HostType[];
  maxResults: number;
}

export interface ProviderResult {
  provider: ProviderName;
  externalId: string;
  name: string;
  url: string;
  lat: number;
  lng: number;
  priceLabel: string | null;
  priceAmount: number | null;
  currency: string | null;
  photoUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  rawJson: string;
}

export interface SearchProvider {
  readonly name: string;
  readonly provider: ProviderName;
  search(query: SearchQuery): Promise<ProviderResult[]>;
}

export class ProviderNotImplementedError extends Error {
  constructor(providerName: string) {
    super(`Provider not implemented: ${providerName}`);
    this.name = 'ProviderNotImplementedError';
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
