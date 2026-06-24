interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* Flight path: departs lower-left, curves up to upper-right */}
      <path
        d="M 5 35 C 5 12 30 5 33 5"
        stroke="#8FF7D0"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Departure dot */}
      <circle cx="5" cy="35" r="4" fill="#8FF7D0" />
      {/* Arrival arrowhead — curve arrives horizontally, arrow points right */}
      <path d="M 39 5 L 33 2 L 33 8 Z" fill="#8FF7D0" />
    </svg>
  );
}
