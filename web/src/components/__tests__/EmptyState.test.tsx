import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../EmptyState';

describe('<EmptyState />', () => {
  it('renders ingest hint and a code snippet', () => {
    render(<EmptyState />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText(/npm run ingest:all/)).toBeInTheDocument();
  });
});
