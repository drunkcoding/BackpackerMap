export function HouseBooking({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="14" cy="14" r="13" fill="#F4EFE5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M14 7 L20 13 L20 20 L8 20 L8 13 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <rect x="11" y="15" width="3" height="5" fill="#F4EFE5" />
      <circle cx="23" cy="7" r="2.5" fill="currentColor" />
    </svg>
  );
}
