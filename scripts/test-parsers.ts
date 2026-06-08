/**
 * Test de parsers contra los correos reales de docs/correos-rappi.md
 * Las bodies simulan lo que stripHtml produce: texto colapsado en una sola línea.
 *
 * Ejecutar: npx tsx scripts/test-parsers.ts
 */

import { parseRappiCard } from '../lib/parsers/rappicard'
import { parseRappiPay } from '../lib/parsers/rappipay'
import type { ParseResult } from '../lib/parsers/types'

// ─── Datos de prueba ────────────────────────────────────────────────────────
// Cada body simula el resultado de stripHtml: tags → espacio, múltiples espacios → uno.

const CASES = [
  {
    label: '1. RappiCard — Compra (Uber)',
    parser: parseRappiCard,
    email: {
      id: 'rc-compra-1',
      from: 'RappiCard <noreply@rappicard.co>',
      subject: 'Resumen de transacción',
      date: 'Sun, 7 Jun 2026 12:25:21 +0000',
      body: '¡Hola, BRANDON NICK GOMEZ AYA! Realizaste una compra con tu RappiCard. Detalle de tu transacción: Monto $17.934 Método de pago *8021 No. de autorización 116056 Comercio Uber Fecha de la transacción 2026-06-07 12:25:21 375x48x1 ¿Necesitas ayuda? Escríbenos desde tu app, estamos 24/7.',
    },
    expect: { monto: 17934, comercio: 'Uber', tipo: 'COMPRA' },
  },
  {
    label: '2. RappiCard — Pago de tarjeta (ABONO_DEUDA)',
    parser: parseRappiCard,
    email: {
      id: 'rc-pago-1',
      from: 'RappiCard <noreply@rappicard.co>',
      subject: 'Comprobante de pago',
      date: 'Thu, 4 Jun 2026 20:20:00 +0000',
      body: 'Hola, BRANDON NICK Recibimos el pago de tu tarjeta y lo estamos procesando. Sigue disfrutando todos los beneficios de tu RappiCard. Destino de pago *4894 Fecha y hora 04 jun 2026 15:20 Método de pago Balance Monto 114.184,57 Cashback 180x180 ¡Gracias por estar al día con el pago de tu deuda! Desde que tienes tu RappiCard, has ganado en total 10.516,13 cashback',
    },
    expect: { monto: 114184, tipo: 'ABONO_DEUDA' },
  },
  {
    label: '3. RappiPay — Transferencia recibida con llave',
    parser: parseRappiPay,
    email: {
      id: 'rp-recv-1',
      from: 'RappiPay <noreply@rappipay.co>',
      subject: 'Tu dinero ya está disponible.',
      date: 'Sat, 2 May 2026 15:18:00 +0000',
      body: '¡Hola, Brandon Nick! ¡Recibiste una transferencia de dinero directamente en tu RappiCuenta! Esta transferencia se realizó a través de tus llaves. Aquí los detalles: Monto recibido $1.050.000 Banco Bancolombia Nro. de transacción 1677974 Fecha de la transacción 02 de mayo de 2026 Hora de la transacción 03:18 pm ¿Necesitas ayuda? Escríbenos desde tu app, estamos 24/7.',
    },
    expect: { monto: 1050000, comercio: 'Bancolombia', tipo: 'TRANSFERENCIA_RECIBIDA' },
  },
  {
    label: '4. RappiPay — Transferencia enviada con llave',
    parser: parseRappiPay,
    email: {
      id: 'rp-send-1',
      from: 'RappiPay <noreply@rappipay.co>',
      subject: '¡Listo! Tu dinero está en camino',
      date: 'Fri, 1 May 2026 18:33:00 +0000',
      body: '¡Hola, Brandon Nick! ¡Tu transferencia fue enviada con éxito! Aquí los detalles: Monto transferido $400.000,00 RappiCuenta de origen ****9514 Llave destino @nestor2058 Cuenta destino ****2747 Banco Bancolombia Costo de la transacción Gratis Nro. de transacción 2218478 Fecha de la transacción 01 de mayo de 2026 Hora de la transacción 06:33 pm ¿Necesitas ayuda?',
    },
    expect: { monto: 400000, comercio: '@nestor2058', tipo: 'TRANSFERENCIA_ENVIADA' },
  },
  {
    label: '5. RappiPay — Depósito bancario (sueldo)',
    parser: parseRappiPay,
    email: {
      id: 'rp-salary-1',
      from: 'RappiPay <noreply@rappipay.co>',
      subject: 'Resumen transferencia Bancaria',
      date: 'Wed, 29 Apr 2026 10:04:00 +0000',
      body: '¡Hola, Brandon Nick! Te hicieron una transferencia bancaria a tu RappiCuenta. Aquí los detalles: Monto recibido $24.208.992 Cuenta de origen 88617029 Banco BANCO CITIBANK COLOMBIA No. de transacción 37767000 Fecha de la transacción 29 de abril de 2026 Hora de la transacción 10:04 am ¿Necesitas ayuda?',
    },
    expect: { monto: 24208992, comercio: 'BANCO CITIBANK COLOMBIA', tipo: 'INGRESO' },
  },
  {
    label: '6. RappiPay — Pago de servicio (ENEL)',
    parser: parseRappiPay,
    email: {
      id: 'rp-enel-1',
      from: 'RappiPay <noreply@holdingrappipay.co>',
      subject: 'RappiPay - Resumen de Pago a Servicio - ENEL',
      date: 'Mon, 27 Apr 2026 19:36:00 +0000',
      body: '¡Hola, Brandon! Te compartimos los datos de tu pago de servicio. Detalles de transacción Nombre del cliente Brandon Gómez Tipo de transacción Pago de Servicio Convenio ENEL Referencia 70380696 Método de pago CARD Monto de recibo $282,230 Comisión $0 Pago total $282,230 Fecha y hora 19:36 hrs, 27 Abr. 2026 Aprobación 1423387656',
    },
    expect: { monto: 282230, comercio: 'ENEL', tipo: 'PAGO_SERVICIO' },
  },
  {
    label: '7. RappiPay — Rentabilidad mensual',
    parser: parseRappiPay,
    email: {
      id: 'rp-rent-1',
      from: 'RappiPay <noreply@rappipay.co>',
      subject: 'Resumen de remuneración en tu RappiCuenta',
      date: 'Fri, 1 May 2026 01:40:00 +0000',
      body: '¡Hola, Brandon Nick! Este es el resumen de la rentabilidad que ganaste este mes por ahorrar en tu cuenta: Aquí los detalles: Rentabilidad de Abril $203.770,46 Fecha de corte 30 de abril de 2026 Intereses retenidos $14.263,89 ¿Necesitas ayuda?',
    },
    expect: { monto: 203770, comercio: 'RappiCuenta', tipo: 'INGRESO' },
  },
]

// ─── Runner ─────────────────────────────────────────────────────────────────

type Expectation = { monto?: number; comercio?: string; tipo?: string }

function check(result: ParseResult, expected: Expectation): { passed: boolean; failures: string[] } {
  if (!result) return { passed: false, failures: ['Parser returned null'] }
  const failures: string[] = []
  if (expected.monto !== undefined && result.monto !== expected.monto) {
    failures.push(`monto: expected ${expected.monto}, got ${result.monto}`)
  }
  if (expected.comercio !== undefined && result.comercio !== expected.comercio) {
    failures.push(`comercio: expected "${expected.comercio}", got "${result.comercio}"`)
  }
  if (expected.tipo !== undefined && result.tipo !== expected.tipo) {
    failures.push(`tipo: expected "${expected.tipo}", got "${result.tipo}"`)
  }
  return { passed: failures.length === 0, failures }
}

let passed = 0
let failed = 0

for (const { label, parser, email, expect: expected } of CASES) {
  const result = parser(email)
  const { passed: ok, failures } = check(result, expected)

  const icon = ok ? '✅' : '❌'
  console.log(`\n${icon} ${label}`)

  if (result) {
    console.log(`   monto:    ${result.monto}`)
    console.log(`   comercio: ${result.comercio ?? '(null)'}`)
    console.log(`   tipo:     ${result.tipo}`)
    console.log(`   fecha:    ${result.fecha}`)
    console.log(`   categ:    ${result.categoria}`)
  } else {
    console.log('   → null (email ignorado)')
  }

  if (!ok) {
    for (const f of failures) console.log(`   ⚠ ${f}`)
    failed++
  } else {
    passed++
  }
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`Resultado: ${passed}/${passed + failed} casos pasaron`)
if (failed > 0) process.exit(1)
