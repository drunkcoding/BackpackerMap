import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationSearchBox } from '../LocationSearchBox';
import type { ApiGeocodeResult } from '../../api';

const SAMPLE: ApiGeocodeResult[] = [
  {
    id: 'R:1234',
    osmType: 'R',
    osmId: 1234,
    name: 'Edinburgh',
    label: 'Edinburgh, Scotland, United Kingdom',
    kind: 'city',
    center: { lat: 55.95, lng: -3.19 },
    bbox: { north: 56, south: 55.9, east: -3.07, west: -3.32 },
    hasPolygon: true,
  },
  {
    id: 'R:5678',
    osmType: 'R',
    osmId: 5678,
    name: 'Edinburg',
    label: 'Edinburg, Texas, United States',
    kind: 'town',
    center: { lat: 26.3, lng: -98.16 },
    bbox: null,
    hasPolygon: true,
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/geocode')) {
      return new Response(JSON.stringify({ results: SAMPLE }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flushDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('<LocationSearchBox />', () => {
  it('renders an input with the placeholder', () => {
    render(<LocationSearchBox selected={null} onSelect={() => {}} onClear={() => {}} />);
    expect(screen.getByPlaceholderText(/Where to/)).toBeInTheDocument();
  });

  it('does not call the API for queries shorter than 2 chars', async () => {
    render(<LocationSearchBox selected={null} onSelect={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Where to/), { target: { value: 'a' } });
    await flushDebounce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debounces and calls /api/geocode after the debounce window', async () => {
    render(<LocationSearchBox selected={null} onSelect={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Where to/), { target: { value: 'edin' } });
    await flushDebounce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('q=edin');
  });

  it('shows results in the dropdown after fetch resolves', async () => {
    render(<LocationSearchBox selected={null} onSelect={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Where to/), { target: { value: 'edin' } });
    await flushDebounce();
    expect(screen.getByText('Edinburgh')).toBeInTheDocument();
    expect(screen.getByText('Edinburg')).toBeInTheDocument();
  });

  it('Enter selects the highlighted result and calls onSelect', async () => {
    const onSelect = vi.fn();
    render(<LocationSearchBox selected={null} onSelect={onSelect} onClear={() => {}} />);
    const input = screen.getByPlaceholderText(/Where to/);
    fireEvent.change(input, { target: { value: 'edin' } });
    await flushDebounce();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].name).toBe('Edinburgh');
  });

  it('ArrowDown then Enter selects the second result', async () => {
    const onSelect = vi.fn();
    render(<LocationSearchBox selected={null} onSelect={onSelect} onClear={() => {}} />);
    const input = screen.getByPlaceholderText(/Where to/);
    fireEvent.change(input, { target: { value: 'edin' } });
    await flushDebounce();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect.mock.calls[0]![0].name).toBe('Edinburg');
  });

  it('clear button calls onClear and resets the input', async () => {
    const onClear = vi.fn();
    render(<LocationSearchBox selected={null} onSelect={() => {}} onClear={onClear} />);
    const input = screen.getByPlaceholderText(/Where to/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'edin' } });
    await flushDebounce();
    const clearBtn = screen.getByLabelText('Clear location');
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });
});
