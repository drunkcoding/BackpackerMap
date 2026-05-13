import type { ApiProperty } from '../api';
import { PhotoPlaceholder } from '../icons/PhotoPlaceholder';
import { CoordsRow } from './CoordsRow';

export function PropertyHero({ property }: { property: ApiProperty }) {
  return (
    <div>
      {property.photoUrl ? (
        <img
          className="bpm-hero-photo"
          src={property.photoUrl}
          alt={property.name}
          loading="lazy"
        />
      ) : (
        <div className="bpm-hero-placeholder" data-testid="hero-placeholder">
          <PhotoPlaceholder />
        </div>
      )}
      <span className="bpm-provider-badge" data-provider={property.provider}>
        {property.provider}
      </span>
      <h2 className="bpm-property-title">{property.name}</h2>
      {property.priceLabel ? <p className="bpm-price">{property.priceLabel}</p> : null}
      <CoordsRow lat={property.lat} lng={property.lng} />
      <a className="bpm-link" href={property.url} target="_blank" rel="noopener noreferrer">
        Open on {property.provider === 'airbnb' ? 'Airbnb' : 'Booking.com'} ↗
      </a>
    </div>
  );
}
