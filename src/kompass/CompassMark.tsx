export default function CompassMark({ size = 28, swing = false }: { size?: number; swing?: boolean }) {
  return (
    <svg className={`compass-mark${swing ? ' swing' : ''}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1="24" y1="4" x2="24" y2="8" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" transform={`rotate(${a} 24 24)`} />
      ))}
      <g className="needle">
        <path d="M24 9 L29 24 L24 24 Z" fill="var(--sky)" />
        <path d="M24 9 L19 24 L24 24 Z" fill="var(--sky-deep)" />
        <path d="M24 39 L29 24 L24 24 Z" fill="currentColor" fillOpacity=".35" />
        <path d="M24 39 L19 24 L24 24 Z" fill="currentColor" fillOpacity=".2" />
      </g>
      <circle cx="24" cy="24" r="2.5" fill="currentColor" />
    </svg>
  );
}
