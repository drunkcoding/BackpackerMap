import { EmptyTent } from '../icons/EmptyTent';

export function EmptyState() {
  return (
    <div className="bpm-empty-state" data-testid="empty-state">
      <EmptyTent />
      <p style={{ maxWidth: '32ch', textAlign: 'center' }}>
        No trails or properties ingested yet. Drop GPX files into{' '}
        <code>data/trails/</code>, place your Airbnb export at{' '}
        <code>data/airbnb/personal_data.json</code>, then run{' '}
        <code>npm run ingest:all</code>.
      </p>
    </div>
  );
}
