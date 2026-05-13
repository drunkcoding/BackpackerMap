import { StatusBanner, type StatusBannerProps } from './StatusBanner';

export function TopBar(props: StatusBannerProps) {
  return (
    <header className="bpm-topbar">
      <span className="bpm-wordmark">BackpackerMap</span>
      <StatusBanner {...props} />
    </header>
  );
}
