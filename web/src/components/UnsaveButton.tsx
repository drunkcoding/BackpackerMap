import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export interface UnsaveButtonProps {
  propertyId: number;
  onUnsaved?: () => void;
  confirmTimeoutMs?: number;
}

type Stage = 'idle' | 'confirming' | 'deleting' | 'error';

export function UnsaveButton({
  propertyId,
  onUnsaved,
  confirmTimeoutMs = 3000,
}: UnsaveButtonProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleClick() {
    if (stage === 'idle' || stage === 'error') {
      setStage('confirming');
      setErrorMsg(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStage('idle'), confirmTimeoutMs);
      return;
    }
    if (stage === 'confirming') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setStage('deleting');
      try {
        await api.deleteProperty(propertyId);
        onUnsaved?.();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStage('error');
      }
    }
  }

  return (
    <button
      type="button"
      className={`bpm-unsave-button${stage === 'confirming' ? ' is-confirming' : ''}`}
      disabled={stage === 'deleting'}
      onClick={handleClick}
      data-testid="unsave-button"
      data-stage={stage}
    >
      {stage === 'idle' && '🗑 Unsave'}
      {stage === 'confirming' && 'Click again to confirm'}
      {stage === 'deleting' && 'Removing…'}
      {stage === 'error' && `Failed — retry${errorMsg ? `: ${errorMsg}` : ''}`}
    </button>
  );
}
