export interface DiscoverToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function DiscoverToggle({ enabled, onChange }: DiscoverToggleProps) {
  return (
    <button
      type="button"
      className={`bpm-discover-toggle${enabled ? ' is-on' : ''}`}
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      data-testid="discover-toggle"
    >
      <span className="bpm-discover-dot" aria-hidden="true" />
      {enabled ? 'Discover ON' : 'Discover OFF'}
    </button>
  );
}
