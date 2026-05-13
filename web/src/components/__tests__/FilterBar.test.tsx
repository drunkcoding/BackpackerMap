import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterBarTier1 } from '../FilterBar.tier1';
import { FilterBarTier2 } from '../FilterBar.tier2';
import { FilterBarTier3 } from '../FilterBar.tier3';
import { DEFAULT_FILTERS } from '../../lib/searchQuery';

describe('<FilterBarTier1 />', () => {
  it('checkin after checkout shows error', () => {
    render(
      <FilterBarTier1
        filters={{ ...DEFAULT_FILTERS, checkin: '2026-07-10', checkout: '2026-07-05' }}
        setFilter={() => {}}
      />,
    );
    expect(screen.getByTestId('filter-dates-error')).toBeInTheDocument();
  });

  it('setting adults calls setFilter with number', () => {
    const setFilter = vi.fn();
    render(<FilterBarTier1 filters={DEFAULT_FILTERS} setFilter={setFilter} />);
    fireEvent.change(screen.getByTestId('filter-adults'), { target: { value: '4' } });
    expect(setFilter).toHaveBeenCalledWith('adults', 4);
  });
});

describe('<FilterBarTier2 />', () => {
  it('toggling a room-type pill calls setFilter with new array', () => {
    const setFilter = vi.fn();
    render(<FilterBarTier2 filters={DEFAULT_FILTERS} setFilter={setFilter} />);
    fireEvent.click(screen.getByTestId('pill-room-entire'));
    expect(setFilter).toHaveBeenCalledWith('roomTypes', ['entire']);
  });

  it('checking free cancellation toggles flag', () => {
    const setFilter = vi.fn();
    render(<FilterBarTier2 filters={DEFAULT_FILTERS} setFilter={setFilter} />);
    fireEvent.click(screen.getByTestId('filter-free-cancellation'));
    expect(setFilter).toHaveBeenCalledWith('freeCancellation', true);
  });
});

describe('<FilterBarTier3 />', () => {
  it('selecting amenities adds them to array', () => {
    const setFilter = vi.fn();
    render(<FilterBarTier3 filters={DEFAULT_FILTERS} setFilter={setFilter} />);
    fireEvent.click(screen.getByTestId('amenity-wifi').querySelector('input')!);
    expect(setFilter).toHaveBeenCalledWith('amenities', ['wifi']);
  });

  it('deselecting an already-selected amenity removes it', () => {
    const setFilter = vi.fn();
    render(
      <FilterBarTier3
        filters={{ ...DEFAULT_FILTERS, amenities: ['wifi', 'pool'] }}
        setFilter={setFilter}
      />,
    );
    fireEvent.click(screen.getByTestId('amenity-wifi').querySelector('input')!);
    expect(setFilter).toHaveBeenCalledWith('amenities', ['pool']);
  });

  it('toggling meal-plan pill works', () => {
    const setFilter = vi.fn();
    render(<FilterBarTier3 filters={DEFAULT_FILTERS} setFilter={setFilter} />);
    fireEvent.click(screen.getByTestId('pill-meal-breakfast'));
    expect(setFilter).toHaveBeenCalledWith('mealPlans', ['breakfast']);
  });

  it('neighbourhoods freetext splits and trims', () => {
    const setFilter = vi.fn();
    render(<FilterBarTier3 filters={DEFAULT_FILTERS} setFilter={setFilter} />);
    fireEvent.change(screen.getByTestId('filter-neighbourhoods'), {
      target: { value: 'Cairngorms, Lake District' },
    });
    expect(setFilter).toHaveBeenCalledWith('neighbourhoods', ['Cairngorms', 'Lake District']);
  });
});
