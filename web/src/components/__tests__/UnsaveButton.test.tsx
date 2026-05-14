import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsaveButton } from '../UnsaveButton';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('<UnsaveButton />', () => {
  it('starts in idle state with the trash label', () => {
    render(<UnsaveButton propertyId={42} />);
    const btn = screen.getByTestId('unsave-button');
    expect(btn.textContent).toContain('Unsave');
    expect(btn.dataset['stage']).toBe('idle');
  });

  it('first click transitions to confirming, does not call the API', () => {
    render(<UnsaveButton propertyId={42} />);
    const btn = screen.getByTestId('unsave-button');
    fireEvent.click(btn);
    expect(btn.dataset['stage']).toBe('confirming');
    expect(btn.textContent).toContain('Click again to confirm');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reverts to idle after the confirm timeout', async () => {
    render(<UnsaveButton propertyId={42} confirmTimeoutMs={3000} />);
    const btn = screen.getByTestId('unsave-button');
    fireEvent.click(btn);
    expect(btn.dataset['stage']).toBe('confirming');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(btn.dataset['stage']).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('second click within the timeout deletes and calls onUnsaved', async () => {
    const onUnsaved = vi.fn();
    render(<UnsaveButton propertyId={42} onUnsaved={onUnsaved} />);
    const btn = screen.getByTestId('unsave-button');
    fireEvent.click(btn);
    fireEvent.click(btn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/properties/42');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'DELETE' });
    expect(onUnsaved).toHaveBeenCalledTimes(1);
  });

  it('shows error state when the API returns non-204', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    render(<UnsaveButton propertyId={42} />);
    const btn = screen.getByTestId('unsave-button');
    fireEvent.click(btn);
    fireEvent.click(btn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(btn.dataset['stage']).toBe('error');
    expect(btn.textContent).toContain('Failed');
  });

  it('error state allows re-trying: click goes back to confirming', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    render(<UnsaveButton propertyId={42} />);
    const btn = screen.getByTestId('unsave-button');
    fireEvent.click(btn);
    fireEvent.click(btn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(btn.dataset['stage']).toBe('error');
    fireEvent.click(btn);
    expect(btn.dataset['stage']).toBe('confirming');
  });
});
