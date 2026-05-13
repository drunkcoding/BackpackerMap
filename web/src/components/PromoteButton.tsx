import { useState } from 'react';
import { api } from '../api';

export interface PromoteButtonProps {
  candidateId: number;
  onPromoted?: (propertyId: number) => void;
}

export function PromoteButton({ candidateId, onPromoted }: PromoteButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle');

  async function handleClick() {
    setState('loading');
    try {
      const result = await api.promoteCandidate(candidateId);
      setState('saved');
      onPromoted?.(result.property.id);
    } catch {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      className="bpm-promote-button"
      disabled={state === 'loading' || state === 'saved'}
      onClick={handleClick}
      data-testid="promote-button"
    >
      {state === 'idle' && '★ Save'}
      {state === 'loading' && 'Saving…'}
      {state === 'saved' && '✓ Saved'}
      {state === 'error' && 'Save failed — retry'}
    </button>
  );
}
