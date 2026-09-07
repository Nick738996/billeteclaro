import { describe, it, expect } from 'vitest'
import { detectBankFromForwardedBody, detectBankFromForwardedEmail } from '@/lib/email/bankSenders'

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

describe('detectBankFromForwardedEmail', () => {
  // Caso real: reenvío AUTOMÁTICO por filtro de Gmail ("Forward it to") —
  // relayea el correo casi intacto, sin bloque "---------- Forwarded
  // message ---------" ni línea "De:" citada. El remitente visible sigue
  // siendo el del banco. Antes de este fix, estas transacciones nunca se
  // procesaban porque solo se escaneaba el cuerpo (detectBankFromForwardedBody).
  it('detecta el banco por el remitente directo cuando el cuerpo no trae "De:" citado (reenvío automático)', () => {
    const body = '¡Hola, Brandon Nick!\nLa compra con tu RappiCuenta fue exitosa.\nMonto $4.800,00\nComercio OXXO BOGOTA CO'
    expect(detectBankFromForwardedEmail('noreply@rappipay.co', body)).toBe('RAPPIPAY')
  })

  it('detecta el banco por el remitente directo con nombre visible (ej. "RappiPay <noreply@rappipay.co>")', () => {
    expect(detectBankFromForwardedEmail('RappiPay <noreply@rappipay.co>', 'cualquier contenido')).toBe('RAPPIPAY')
  })

  // Caso real: reenvío MANUAL (botón "Forward") — el remitente visible es
  // el del usuario, no el del banco; hay que caer al escaneo del cuerpo.
  it('cae al escaneo del cuerpo cuando el remitente directo es el del usuario (reenvío manual)', () => {
    const body = `---------- Forwarded message ---------
De: <colpatriaInforma@scotiabankcolpatria.com>
Date: jue, 6 mar 2025 a la(s) 6:09 p.m.
Subject: Scotiabank Colpatria en Linea
To: <diegosarmientoq1245@gmail.com>`
    expect(detectBankFromForwardedEmail('brandon7389@gmail.com', body)).toBe('SCOTIABANK_COLPATRIA')
  })

  it('devuelve OTRO si ni el remitente directo ni el cuerpo resuelven a un banco conocido', () => {
    expect(detectBankFromForwardedEmail('brandon7389@gmail.com', 'Hola, ¿cómo estás?')).toBe('OTRO')
  })
})
