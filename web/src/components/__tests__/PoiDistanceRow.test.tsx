import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PoiDistanceRow } from '../PoiDistanceRow';
import type { ApiPoi } from '../../api';

const poi: ApiPoi = {
  id: 11,
  collection: 'Scotland 2026',
  externalId: 'ChIJ_test',
  name: 'Falls of Falloch',
  lat: 56.345,
  lng: -4.705,
  category: 'Tourist attraction',
  note: null,
  url: null,
  address: 'A82, Crianlarich, UK',
};

function mockFetch(impl: () => Promise<Response>): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(impl);
}

describe('<PoiDistanceRow />', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders drive distance + via-carpark line when API returns viaCarpark', async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            meters: 9000,
            seconds: 720,
            cached: false,
            viaCarpark: { lat: 56.2702, lng: -4.7141 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    render(<PoiDistanceRow index={1} poi={poi} propertyId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId(`poi-via-carpark-${poi.id}`)).toBeInTheDocument();
    });
    expect(screen.getByTestId(`poi-distance-${poi.id}`).textContent).toContain('↪ via carpark');
  });

  it('omits via-carpark line when API returns no viaCarpark', async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ meters: 12_000, seconds: 900, cached: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    render(<PoiDistanceRow index={1} poi={poi} propertyId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId(`poi-distance-${poi.id}`).textContent).toContain('12');
    });
    expect(screen.queryByTestId(`poi-via-carpark-${poi.id}`)).not.toBeInTheDocument();
  });

  it('calls onHover with poi+carpark on mouse enter, nulls on mouse leave', async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            meters: 9000,
            seconds: 720,
            cached: false,
            viaCarpark: { lat: 56.2702, lng: -4.7141 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const onHover = vi.fn();
    render(<PoiDistanceRow index={1} poi={poi} propertyId={1} onHover={onHover} />);
    await waitFor(() => {
      expect(screen.getByTestId(`poi-via-carpark-${poi.id}`)).toBeInTheDocument();
    });
    const row = screen.getByTestId(`poi-row-${poi.id}`);
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    expect(onHover).toHaveBeenCalledWith(poi, { lat: 56.2702, lng: -4.7141 });
    expect(onHover).toHaveBeenCalledWith(null, null);
  });

  it('shows "off-road" on 422 when no carpark fallback succeeded', async () => {
    mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'no driving route' }), { status: 422 })),
    );
    render(<PoiDistanceRow index={1} poi={poi} propertyId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId(`poi-distance-${poi.id}`).textContent).toBe('— off-road');
    });
  });
});
