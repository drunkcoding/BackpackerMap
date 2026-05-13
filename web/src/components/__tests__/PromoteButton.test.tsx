import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromoteButton } from '../PromoteButton';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('<PromoteButton />', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders ★ Save in idle state', () => {
    render(<PromoteButton candidateId={1} />);
    expect(screen.getByTestId('promote-button').textContent).toContain('Save');
  });

  it('on click → calls API → transitions to Saved', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse({ property: { id: 42 } })),
    );
    const onPromoted = vi.fn();
    render(<PromoteButton candidateId={1} onPromoted={onPromoted} />);
    fireEvent.click(screen.getByTestId('promote-button'));
    await waitFor(() =>
      expect(screen.getByTestId('promote-button').textContent).toContain('Saved'),
    );
    expect(onPromoted).toHaveBeenCalledWith(42);
  });

  it('on HTTP error → transitions to retry state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('boom', { status: 500 })),
    );
    render(<PromoteButton candidateId={1} />);
    fireEvent.click(screen.getByTestId('promote-button'));
    await waitFor(() =>
      expect(screen.getByTestId('promote-button').textContent).toContain('retry'),
    );
  });
});
