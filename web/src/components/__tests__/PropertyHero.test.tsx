import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PropertyHero } from '../PropertyHero';
import type { ApiProperty } from '../../api';

const base: ApiProperty = {
  id: 1,
  provider: 'airbnb',
  externalId: '12345',
  name: 'Cabin in the Cairngorms',
  url: 'https://www.airbnb.com/rooms/12345',
  lat: 56.7867,
  lng: -5.0035,
  priceLabel: '£142 / night',
  photoUrl: 'https://example.com/photo.jpg',
};

describe('<PropertyHero />', () => {
  it('renders photo when photoUrl set', () => {
    render(<PropertyHero property={base} />);
    expect(screen.getByRole('img', { name: base.name })).toBeInTheDocument();
    expect(screen.queryByTestId('hero-placeholder')).not.toBeInTheDocument();
  });

  it('renders SVG placeholder when photoUrl missing', () => {
    render(<PropertyHero property={{ ...base, photoUrl: null }} />);
    expect(screen.getByTestId('hero-placeholder')).toBeInTheDocument();
  });

  it('renders Airbnb provider badge', () => {
    render(<PropertyHero property={base} />);
    const badge = screen.getByText('airbnb');
    expect(badge.getAttribute('data-provider')).toBe('airbnb');
  });

  it('uses Booking.com label for booking provider', () => {
    render(<PropertyHero property={{ ...base, provider: 'booking', externalId: 'lodge', url: 'https://booking.com/x' }} />);
    expect(screen.getByText(/Open on Booking\.com/)).toBeInTheDocument();
  });
});
