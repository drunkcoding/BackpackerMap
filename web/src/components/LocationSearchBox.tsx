import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, type ApiGeocodeResult } from '../api';

export interface LocationSearchBoxProps {
  selected: ApiGeocodeResult | null;
  onSelect: (result: ApiGeocodeResult) => void;
  onClear: () => void;
  debounceMs?: number;
}

export function LocationSearchBox({
  selected,
  onSelect,
  onClear,
  debounceMs = 250,
}: LocationSearchBoxProps) {
  const [text, setText] = useState<string>('');
  const [results, setResults] = useState<ApiGeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setText(selected.name);
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    if (selected && trimmed === selected.name) return;

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      api
        .geocode(trimmed, controller.signal)
        .then((resp) => {
          if (controller.signal.aborted) return;
          setResults(resp.results);
          setHighlighted(0);
          setOpen(true);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
          setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [text, debounceMs, selected]);

  function commit(result: ApiGeocodeResult) {
    onSelect(result);
    setText(result.name);
    setResults([]);
    setOpen(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      const first = results[0];
      if (e.key === 'Enter' && first) {
        e.preventDefault();
        commit(first);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[highlighted];
      if (r) commit(r);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  function handleClear() {
    setText('');
    setResults([]);
    setOpen(false);
    onClear();
  }

  return (
    <div className="bpm-location-search" ref={containerRef}>
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onKeyDown={handleKey}
        placeholder="Where to? (or leave empty to search the map view)"
        className="bpm-location-search__input"
        aria-label="Search a city, town, region or country"
        aria-autocomplete="list"
        autoComplete="off"
      />
      {(text || selected) && (
        <button
          type="button"
          className="bpm-location-search__clear"
          onClick={handleClear}
          aria-label="Clear location"
        >
          ×
        </button>
      )}
      {open && (results.length > 0 || error) && (
        <div className="bpm-location-search__dropdown">
          {error && <div className="bpm-location-search__error">{error}</div>}
          {!error && loading && results.length === 0 && (
            <div className="bpm-location-search__loading">searching…</div>
          )}
          {!error &&
            results.map((r, i) => (
              <button
                type="button"
                key={r.id}
                className={`bpm-location-search__item${i === highlighted ? ' is-active' : ''}`}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(r);
                }}
              >
                <span className="bpm-location-search__name">{r.name}</span>
                <span className="bpm-location-search__label">{r.label}</span>
                <span className={`bpm-location-search__kind bpm-location-search__kind--${r.kind}`}>
                  {r.kind}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
