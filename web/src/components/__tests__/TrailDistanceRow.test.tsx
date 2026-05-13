import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrailDistanceRow } from '../TrailDistanceRow';
import type { ApiTrail } from '../../api';

const trail: ApiTrail = {
  id: 7,
  name: 'Loch an Eilein',
  trailheadLat: 57.1,
  trailheadLng: -3.8,
  lengthMeters: 8400,
  elevationGainMeters: 320,
};

function mockFetch(impl: () => Promise<Response>): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(impl);
}

describe('<TrailDistanceRow />', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows loading then loaded distance', async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ meters: 42_000, seconds: 2280, cached: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    render(<TrailDistanceRow index={1} trail={trail} propertyId={1} />);
    expect(screen.getByTestId('trail-distance-7')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('trail-distance-7').textContent).toContain('42 KM');
    });
    expect(screen.getByTestId('trail-distance-7').textContent).toContain('38 MIN');
  });

  it('shows "unreachable" on 500 errors', async () => {
    mockFetch(() => Promise.resolve(new Response('boom', { status: 500 })));
    render(<TrailDistanceRow index={1} trail={trail} propertyId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('trail-distance-7').textContent).toBe('— unreachable');
    });
  });

  it('shows "off-road" on 422 (no routable road near coords)', async () => {
    mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'no driving route' }), { status: 422 })),
    );
    render(<TrailDistanceRow index={1} trail={trail} propertyId={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('trail-distance-7').textContent).toBe('— off-road');
    });
  });

  it('renders meta with elevation and length', () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ meters: 0, seconds: 0, cached: true }), { status: 200 }),
      ),
    );
    render(<TrailDistanceRow index={3} trail={trail} propertyId={1} />);
    expect(screen.getByText(/320 m gain/)).toBeInTheDocument();
    expect(screen.getByText(/8\.4 km/)).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
  });

  it('calls onHover with trail id on mouse enter and null on leave', async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ meters: 0, seconds: 0, cached: true }), { status: 200 }),
      ),
    );
    const onHover = vi.fn();
    const { getByTestId } = render(
      <TrailDistanceRow index={1} trail={trail} propertyId={1} onHover={onHover} />,
    );
    const row = getByTestId('trail-row-7');
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    expect(onHover).toHaveBeenCalledWith(7);
    expect(onHover).toHaveBeenCalledWith(null);
  });
});
