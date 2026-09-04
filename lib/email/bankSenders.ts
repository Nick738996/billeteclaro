// Remitentes conocidos por banco + detección/limpieza de HTML — sin
// dependencias de Node ni de `googleapis`, para poder importarse tanto desde
// server (parsers, forwardingService) como desde un componente cliente (el
// wizard de reenvío muestra esta lista para que el usuario arme su filtro).
import type { Banco } from '@/lib/types'

export const BANK_SENDERS: Record<string, Banco> = {
  // Rappi
  'noreply@rappicard.co':                                        'RAPPICARD',
  'noreply@rappipay.co':                                         'RAPPIPAY',
  'noreply@holdingrappipay.co':                                  'RAPPIPAY',

  // Bancolombia
  'alertasynotificaciones@an.notificacionesbancolombia.com':     'BANCOLOMBIA',
  'alertasynotificaciones@notificacionesbancolombia.com':        'BANCOLOMBIA',

  // Davivienda
  'notificaciones@davivienda.com':                               'DAVIVIENDA',
  'alertas@davivienda.com':                                      'DAVIVIENDA',
  'davibankinforma@davibank.com':                                'DAVIVIENDA',

  // BBVA
  'alertas@bbva.com.co':                                         'BBVA',
  'notificaciones@bbva.com.co':                                  'BBVA',

  // Scotiabank Colpatria
  'notificaciones@colpatria.com':                                'SCOTIABANK_COLPATRIA',
  'colpatriainforma@scotiabankcolpatria.com':                    'SCOTIABANK_COLPATRIA',

  // Banco de Bogotá
  'alertas@bancodebogota.com.co':                                'BANCO_DE_BOGOTA',

  // Nu Colombia
  'no-reply@nu.com.co':                                          'NU',
  'notificaciones@nu.com.co':                                    'NU',

  // Nequi
  'no-reply@nequi.com.co':                                       'NEQUI',

  // Lulo Bank
  'notificaciones@lulobank.com':                                 'LULO_BANK',

  // Itaú
  'alertas@itau.co':                                             'ITAU',

  // Falabella
  'notificaciones@falabella.com.co':                             'FALABELLA',
}

export function detectBank(fromHeader: string): Banco {
  const emailMatch = fromHeader.match(/<([^>]+)>/)
  const email = (emailMatch ? emailMatch[1] : fromHeader).toLowerCase().trim()
  return BANK_SENDERS[email] ?? 'OTRO'
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&uuml;/g, 'ü')
    .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Remitentes agrupados por banco, con label legible — usado por el wizard de reenvío. */
export function bankSendersByBanco(): Array<{ banco: Banco; senders: string[] }> {
  const map = new Map<Banco, string[]>()
  for (const [sender, banco] of Object.entries(BANK_SENDERS)) {
    if (!map.has(banco)) map.set(banco, [])
    map.get(banco)!.push(sender)
  }
  return [...map.entries()].map(([banco, senders]) => ({ banco, senders }))
}
