import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBanner } from '../StatusBanner';

describe('<StatusBanner />', () => {
  it('zero state pluralises correctly', () => {
    render(<StatusBanner trails={0} properties={0} cached={0} />);
    expect(screen.getByTestId('status-banner')).toHaveTextContent(
      '0 trails · 0 properties · 0 cached',
    );
  });

  it('singular for n=1', () => {
    render(<StatusBanner trails={1} properties={1} cached={1} />);
    expect(screen.getByTestId('status-banner')).toHaveTextContent(
      '1 trail · 1 property · 1 cached',
    );
  });

  it('plural for n>1', () => {
    render(<StatusBanner trails={12} properties={7} cached={84} />);
    expect(screen.getByTestId('status-banner')).toHaveTextContent(
      '12 trails · 7 properties · 84 cached',
    );
  });
});
