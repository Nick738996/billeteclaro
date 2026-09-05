interface Props {
  /** Tamaño del ícono en px — cada pantalla usaba un valor propio (40/36/45) sin motivo real */
  size?: number
  /** El header del dashboard pinta el glifo directo sobre el fondo del header, sin el chip cuadrado de "ícono de app" que sí usan landing/onboarding */
  withBackground?: boolean
  textSize?: string
}

export default function Logo({ size = 40, withBackground = true, textSize = 'var(--text-lg)' }: Props) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ color: 'var(--text)' }}>
        {withBackground && <rect width="100" height="100" rx="17" style={{ fill: 'var(--surface)' }} />}
        <line x1="30" y1="18" x2="30" y2="82" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M30,18 Q70,18 70,34 Q70,50 30,50" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M30,50 Q78,50 78,66 Q78,82 30,82" stroke="var(--green)" strokeWidth="6" fill="none" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: textSize, letterSpacing: '-0.02em' }}>
        <span style={{ fontWeight: 400, color: 'var(--text)' }}>Billete</span>
        <span style={{ fontWeight: 700, color: 'var(--green)' }}>Claro</span>
      </span>
    </div>
  )
}
