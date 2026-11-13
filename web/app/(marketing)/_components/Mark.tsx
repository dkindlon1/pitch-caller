// The PitchIQ mark: a ball with its two seams.
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="mk-mark">
      <circle cx="12" cy="12" r="10.5" fill="#F4F4F1" />
      <path d="M6.2 4.6c2.3 2 3.4 4.4 3.4 7.4s-1.1 5.4-3.4 7.4M17.8 4.6c-2.3 2-3.4 4.4-3.4 7.4s1.1 5.4 3.4 7.4" fill="none" stroke="var(--mk-accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
