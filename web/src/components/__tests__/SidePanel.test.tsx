import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SidePanel } from '../SidePanel';
import type { ApiProperty } from '../../api';

const property: ApiProperty = {
  id: 1,
  provider: 'airbnb',
  externalId: '1',
  name: 'Test',
  url: 'https://example.com',
  lat: 0,
  lng: 0,
  priceLabel: null,
  photoUrl: null,
};

describe('<SidePanel />', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ meters: 0, seconds: 0, cached: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('closed: aria-hidden true, no property content', () => {
    render(<SidePanel property={null} trails={[]} onClose={() => {}} />);
    const panel = screen.getByTestId('side-panel');
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('open: aria-hidden false, property content visible', () => {
    render(<SidePanel property={property} trails={[]} onClose={() => {}} />);
    const panel = screen.getByTestId('side-panel');
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
