interface LogoProps {
  size?: number;
  className?: string;
  /** Background color behind the logo — used for the map-pin inner circle cutout */
  bgColor?: string;
}

export function Logo({ size = 32, className, bgColor = "#070A12" }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* Arc: 270° counter-clockwise, center (40,28) r=20 */}
      <path
        d="M 60,28 A 20,20 0 1,0 40,8"
        stroke="#8FF7D0"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Airplane in the NE gap, pointing northeast */}
      <g transform="translate(54,14) rotate(45)">
        <rect x="-1.8" y="-6" width="3.6" height="11" rx="1.8" fill="#8FF7D0" />
        <path d="M -1.8,-1 L -7.5,4.5 L -1.8,2.5 Z" fill="#8FF7D0" />
        <path d="M  1.8,-1 L  7.5,4.5 L  1.8,2.5 Z" fill="#8FF7D0" />
        <path d="M -1.5,4 L -4.5,8 L -1.5,5.5 Z"    fill="#8FF7D0" />
        <path d="M  1.5,4 L  4.5,8 L  1.5,5.5 Z"    fill="#8FF7D0" />
      </g>
      {/* Map pin */}
      <path
        d="M40,44 C33,44 28,49.5 28,56 C28,64 40,73 40,73 C40,73 52,64 52,56 C52,49.5 47,44 40,44 Z"
        fill="#8FF7D0"
      />
      {/* Inner cutout — painted with bgColor to fake transparency */}
      <circle cx="40" cy="55" r="4.5" fill={bgColor} />
    </svg>
  );
}
