import { describe, it, expect } from 'vitest'
import { cleanForwardedBody } from '@/lib/utils/cleanForwardedBody'

// Caso real: reenvío doble (banco → amigo → usuario → billeteclaro) de un
// correo de Scotiabank Colpatria — el contenido real (tabla
// COMERCIO/MONTO/FECHA/HORA) queda después de dos bloques de encabezado de
// reenvío + un disclaimer bilingüe largo.
const DOUBLE_FORWARD = `---------- Forwarded message ---------
De: Diego Alejandro Sarmiento charry <diegosarmientoq1245@gmail.com>
Date: vie, 7 mar 2025 a la(s) 1:54 p.m.
Subject: Fwd: Scotiabank Colpatria en Linea
To: <brandon7389@gmail.com>



[image: signature_81710199]



*CONFIDENCIALIDAD:* Este mensaje y cualquier archivo adjunto son
confidenciales.



---------- Forwarded message ---------
De: <colpatriaInforma@scotiabankcolpatria.com>
Date: jue, 6 mar 2025 a la(s) 6:09 p.m.
Subject: Scotiabank Colpatria en Linea
To: <diegosarmientoq1245@gmail.com>




*Apreciado(a) Cliente: *


Scotiabank Colpatria notifica que el día de hoy realizaste con tu tarjeta Visa
Platinum la siguiente transacción o compra recurrente:

*COMERCIO* *MONTO* *FECHA* *HORA*
DL*DIDI RIDES CO 9,200 2025/03/06 18:09:09
`

describe('cleanForwardedBody', () => {
  it('quita ambos bloques de encabezado de reenvío de Gmail (reenvío doble)', () => {
    const cleaned = cleanForwardedBody(DOUBLE_FORWARD)
    expect(cleaned).not.toContain('Forwarded message')
    expect(cleaned).not.toContain('diegosarmientoq1245@gmail.com')
    expect(cleaned).not.toContain('colpatriaInforma@scotiabankcolpatria.com')
  })

  it('quita el placeholder de firma-imagen', () => {
    const cleaned = cleanForwardedBody(DOUBLE_FORWARD)
    expect(cleaned).not.toContain('[image:')
  })

  it('preserva el contenido real de la transacción', () => {
    const cleaned = cleanForwardedBody(DOUBLE_FORWARD)
    expect(cleaned).toContain('DL*DIDI RIDES CO')
    expect(cleaned).toContain('9,200')
    expect(cleaned).toContain('2025/03/06')
  })

  it('deja el contenido real dentro de los primeros 1000 caracteres', () => {
    const cleaned = cleanForwardedBody(DOUBLE_FORWARD)
    expect(cleaned.indexOf('DL*DIDI RIDES CO')).toBeLessThan(1000)
  })

  it('quita el encabezado estilo Outlook (guiones bajos + De/Enviado/Para/Asunto)', () => {
    const body = `________________________________
De: Banco X <alertas@bancox.com>
Enviado: jueves, 6 de marzo de 2025 6:09 p. m.
Para: Juan Pérez <juan@example.com>
Asunto: Notificación de transacción

Realizaste una compra por $9.200 en DIDI RIDES.`
    const cleaned = cleanForwardedBody(body)
    expect(cleaned).not.toContain('alertas@bancox.com')
    expect(cleaned).toContain('Realizaste una compra por $9.200 en DIDI RIDES.')
  })

  it('no rompe un correo sin ningún encabezado de reenvío', () => {
    const body = 'Realizaste una compra por $45.000 en Éxito el 2026-01-01.'
    expect(cleanForwardedBody(body)).toBe(body)
  })

  it('colapsa saltos de línea excesivos que deja la limpieza', () => {
    const cleaned = cleanForwardedBody(DOUBLE_FORWARD)
    expect(cleaned).not.toContain('\n\n\n')
  })
})
