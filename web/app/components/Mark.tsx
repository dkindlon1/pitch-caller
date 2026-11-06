// The PitchIQ mark: the 3x3 zone with a slider chip in the low, away corner.
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
      <rect x="3" y="3" width="26" height="26" rx="5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M11.7 3v26M20.3 3v26M3 11.7h26M3 20.3h26" stroke="currentColor" strokeWidth="1.4" opacity=".5" />
      <rect x="19.5" y="20.5" width="10" height="8" rx="2" fill="#FFD43B" />
    </svg>
  );
}
