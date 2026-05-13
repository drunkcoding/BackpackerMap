import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoordsRow } from '../CoordsRow';

describe('<CoordsRow />', () => {
  it('renders formatted lat/lng with proper hemisphere', () => {
    const { container } = render(<CoordsRow lat={56.7867} lng={-5.0035} />);
    expect(container.textContent).toBe('56.7867° N · 5.0035° W');
    expect(screen.getByText(/56\.7867° N/)).toBeInTheDocument();
  });
});
