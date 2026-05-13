import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiscoverToggle } from '../DiscoverToggle';

describe('<DiscoverToggle />', () => {
  it('shows OFF label when disabled', () => {
    render(<DiscoverToggle enabled={false} onChange={() => {}} />);
    expect(screen.getByTestId('discover-toggle').textContent).toContain('OFF');
  });

  it('shows ON label when enabled', () => {
    render(<DiscoverToggle enabled={true} onChange={() => {}} />);
    expect(screen.getByTestId('discover-toggle').textContent).toContain('ON');
  });

  it('clicking calls onChange with flipped value', () => {
    const onChange = vi.fn();
    render(<DiscoverToggle enabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('discover-toggle'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
