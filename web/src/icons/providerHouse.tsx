import { HouseAirbnb } from './HouseAirbnb';
import { HouseBooking } from './HouseBooking';
import { HouseAmap } from './HouseAmap';

export type MarkerProvider = 'airbnb' | 'booking' | 'amap';

export function providerHouse(provider: MarkerProvider) {
  if (provider === 'airbnb') return <HouseAirbnb />;
  if (provider === 'amap') return <HouseAmap />;
  return <HouseBooking />;
}
