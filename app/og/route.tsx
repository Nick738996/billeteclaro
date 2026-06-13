import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#0A0A0A',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              background: '#4ADE80',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 700,
              color: '#0A0A0A',
            }}
          >
            B
          </div>
          <span style={{ fontSize: '28px', fontWeight: 600, color: '#FFFFFF' }}>
            BilleteClaro
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontSize: '64px',
            fontWeight: 700,
            color: '#FFFFFF',
            margin: '0 0 20px',
            lineHeight: 1.1,
          }}
        >
          Tu radar
          <br />
          financiero
        </h1>

        {/* Descripción */}
        <p
          style={{
            fontSize: '28px',
            color: '#888888',
            margin: '0 0 48px',
            lineHeight: 1.4,
            maxWidth: '700px',
          }}
        >
          Lee tus correos de banco automáticamente.
          <br />
          Sin hacer nada.
        </p>

        {/* CTA */}
        <div
          style={{
            background: '#4ADE80',
            borderRadius: '99px',
            padding: '12px 28px',
            fontSize: '20px',
            fontWeight: 600,
            color: '#0A0A0A',
          }}
        >
          billeteclaro.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
