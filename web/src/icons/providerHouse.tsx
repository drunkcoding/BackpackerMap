import { HouseAirbnb } from './HouseAirbnb';
import { HouseBooking } from './HouseBooking';
import { HouseCtrip } from './HouseCtrip';

export type MarkerProvider = 'airbnb' | 'booking' | 'ctrip';

export function providerHouse(provider: MarkerProvider) {
  if (provider === 'airbnb') return <HouseAirbnb />;
  if (provider === 'ctrip') return <HouseCtrip />;
  return <HouseBooking />;
}
