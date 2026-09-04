import { describe, it, expect } from 'vitest'
import { detectBankFromForwardedBody } from '@/lib/email/bankSenders'

describe('detectBankFromForwardedBody', () => {
  it('detecta el banco cuando "De:" y el email están en la misma línea', () => {
    const body = `---------- Forwarded message ---------
De: <colpatriaInforma@scotiabankcolpatria.com>
Date: jue, 6 mar 2025 a la(s) 6:09 p.m.
Subject: Scotiabank Colpatria en Linea
To: <diegosarmientoq1245@gmail.com>`
    expect(detectBankFromForwardedBody(body)).toBe('SCOTIABANK_COLPATRIA')
  })

  // Caso real: Gmail cortó la línea "De: Nombre <email>" justo entre "<" y
  // el email por ser demasiado larga — el email quedó en la línea siguiente.
  it('detecta el banco cuando el cliente de correo corta la línea "De:" antes del email', () => {
    const body = `---------- Forwarded message ---------
De: Alertas y Notificaciones <
alertasynotificaciones@notificacionesbancolombia.com>
Fecha: El vie, 18 abr. 2025 a la(s) 2:05 p.m.
Asunto: Alertas y Notificaciones
Para: <cynthiguz7@gmail.com>`
    expect(detectBankFromForwardedBody(body)).toBe('BANCOLOMBIA')
  })

  // Caso real: reenvío doble — la primera línea "De:" es la del reenviador
  // intermedio (un amigo), no la del banco.
  it('en un reenvío doble, usa el "De:" que resuelve a un banco conocido, no el primero', () => {
    const body = `---------- Forwarded message ---------
De: Diego Alejandro Sarmiento charry <diegosarmientoq1245@gmail.com>
Date: vie, 7 mar 2025 a la(s) 1:54 p.m.
Subject: Fwd: Scotiabank Colpatria en Linea
To: <brandon7389@gmail.com>

---------- Forwarded message ---------
De: <colpatriaInforma@scotiabankcolpatria.com>
Date: jue, 6 mar 2025 a la(s) 6:09 p.m.
Subject: Scotiabank Colpatria en Linea
To: <diegosarmientoq1245@gmail.com>`
    expect(detectBankFromForwardedBody(body)).toBe('SCOTIABANK_COLPATRIA')
  })

  it('devuelve OTRO si ningún remitente encontrado es un banco conocido', () => {
    const body = `---------- Forwarded message ---------
De: Juan Perez <juan@gmail.com>
Date: vie, 7 mar 2025
Subject: Hola
To: <alguien@gmail.com>`
    expect(detectBankFromForwardedBody(body)).toBe('OTRO')
  })

  it('devuelve OTRO si no hay ningún bloque de reenvío', () => {
    expect(detectBankFromForwardedBody('Hola, ¿cómo estás?')).toBe('OTRO')
  })
})
