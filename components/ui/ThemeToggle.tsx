'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Placeholder del mismo tamaño para evitar layout shift
  if (!mounted) return <div style={{ width: 72, height: 32 }} />

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      style={{
        position: 'relative',
        width: 72,
        height: 32,
        borderRadius: 999,
        border: `1px solid ${isDark ? '#2E2E2E' : '#E0E0E0'}`,
        background: isDark ? '#1C1C1C' : '#F0F0F0',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {/* Círculo deslizante */}
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: 3,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: isDark ? '#FFFFFF' : '#0A0A0A',
          transform: isDark ? 'translateX(40px)' : 'translateX(0)',
          transition: 'transform 0.2s ease',
          zIndex: 1,
        }}
      />
      {/* Sol — izquierda = light mode */}
      <span
        style={{
          position: 'absolute',
          left: 7,
          display: 'flex',
          alignItems: 'center',
          zIndex: 2,
          opacity: isDark ? 0.3 : 1,
          color: isDark ? '#888888' : '#FFFFFF',
          transition: 'opacity 0.2s ease',
        }}
      >
        <Sun size={14} />
      </span>
      {/* Luna — derecha = dark mode */}
      <span
        style={{
          position: 'absolute',
          right: 7,
          display: 'flex',
          alignItems: 'center',
          zIndex: 2,
          opacity: isDark ? 1 : 0.3,
          color: isDark ? '#0A0A0A' : '#888888',
          transition: 'opacity 0.2s ease',
        }}
      >
        <Moon size={14} />
      </span>
    </button>
  )
}
