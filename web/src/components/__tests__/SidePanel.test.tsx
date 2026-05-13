import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SidePanel } from '../SidePanel';
import type { ApiPoi, ApiProperty } from '../../api';

const property: ApiProperty = {
  id: 1,
  provider: 'airbnb',
  externalId: '1',
  name: 'Test',
  url: 'https://example.com',
  lat: 56.3,
  lng: -4.7,
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

  const samplePoi: ApiPoi = {
    id: 5,
    collection: 'X',
    externalId: 'e',
    name: 'The Drovers Inn',
    lat: 56.27,
    lng: -4.71,
    category: null,
    note: 'great rest stop',
    url: null,
    address: null,
  };

  it('renders Nearest places section + chip row when pois are provided, but list hidden by default (unselected)', () => {
    render(
      <SidePanel
        property={property}
        trails={[]}
        pois={[samplePoi]}
        isCollectionVisible={() => false}
        onToggleCollection={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Nearest places')).toBeInTheDocument();
    expect(screen.getByTestId('poi-collection-chip-X')).toBeInTheDocument();
    expect(screen.getByTestId('poi-empty-hint')).toHaveTextContent(/Select a list/);
    expect(screen.queryByText('The Drovers Inn')).not.toBeInTheDocument();
  });

  it('renders the POI list when its collection is marked visible', () => {
    render(
      <SidePanel
        property={property}
        trails={[]}
        pois={[samplePoi]}
        isCollectionVisible={(c) => c === 'X'}
        onToggleCollection={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('The Drovers Inn')).toBeInTheDocument();
    expect(screen.queryByTestId('poi-empty-hint')).not.toBeInTheDocument();
  });

  it('clicking a collection chip calls onToggleCollection with the collection name', () => {
    const onToggle = vi.fn();
    render(
      <SidePanel
        property={property}
        trails={[]}
        pois={[samplePoi]}
        isCollectionVisible={() => false}
        onToggleCollection={onToggle}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('poi-collection-chip-X'));
    expect(onToggle).toHaveBeenCalledWith('X');
  });

  it('does NOT render Nearest places section when pois is empty', () => {
    render(<SidePanel property={property} trails={[]} pois={[]} onClose={() => {}} />);
    expect(screen.queryByText('Nearest places')).not.toBeInTheDocument();
  });
});
