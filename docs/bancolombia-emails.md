# Correos de referencia — Bancolombia

Archivo de referencia para construir el parser de Bancolombia.
Ubicar en: `lib/parsers/docs/bancolombia-emails.md`

---

## Metadata del remitente

| Campo | Valor |
|---|---|
| From (principal) | `alertasynotificaciones@an.notificacionesbancolombia.com` |
| From (alternativo) | `alertasynotificaciones@notificacionesbancolombia.com` |
| Nombre visible | `Alertas y Notificaciones` |

> ⚠️ Hay dos dominios distintos: `an.notificacionesbancolombia.com` y `notificacionesbancolombia.com`. El parser debe reconocer ambos.

---

## Tipo 1 — Transferencia enviada

**Asunto:** Alertas y Notificaciones
**Fecha:** dom, 7 jun 2026, 8:07 a.m.

**Cuerpo relevante:**
```
Bancolombia: Transferiste $120,000.00 desde tu cuenta 2997 a la cuenta *3232989410 el 07/06/2026 a las 08:07. ¿Dudas? Llamanos al 018000931987. Estamos cerca.
```

**Campos a extraer:**
- tipo: `TRANSFERENCIA_ENVIADA`
- monto: `120000`
- cuenta_origen: `2997`
- cuenta_destino: `*3232989410`
- fecha: `2026-06-07T08:07:00`
- comercio/descripcion: `Transferencia enviada`

**Patrón regex clave:**
```
Transferiste \$([0-9,\.]+) desde tu cuenta (\w+) a la cuenta \*?(\w+) el (\d{2}/\d{2}/\d{4}) a las (\d{2}:\d{2})
```

---

## Tipo 2 — Transferencia recibida

**Asunto:** Alertas y Notificaciones
**Fecha:** sáb, 6 jun 2026, 11:00 a.m.

**Cuerpo relevante:**
```
Bancolombia: Recibiste una transferencia por $130,000 de ERNESTO CASTELLANOS en tu cuenta **2997, el 06/06/2026 a las 10:59. Si tienes dudas, hablemos: 018000931987. Siempre a tu lado.
```

**Campos a extraer:**
- tipo: `TRANSFERENCIA_RECIBIDA`
- monto: `130000`
- comercio/remitente: `Ernesto Castellanos` (aplicar toTitleCase)
- cuenta_destino: `**2997`
- fecha: `2026-06-06T10:59:00`

**Patrón regex clave:**
```
Recibiste una transferencia por \$([0-9,\.]+) de ([A-Z\s]+) en tu cuenta \*+(\w+), el (\d{2}/\d{2}/\d{4}) a las (\d{2}:\d{2})
```

---

## Tipo 3 — Pago por código QR

**Asunto:** Alertas y Notificaciones
**Fecha:** lun, 25 may 2026, 4:16 p.m.

**Cuerpo relevante:**
```
Bancolombia: BRANDON NICK GOMEZ AYA pagaste $6,000.00 por codigo QR desde tu cuenta *2997 a la llave 0091322191 el 25/05/2026 a las 16:16. Con codigo QR es facil y de una. Dudas al 018000912345.
```

**Campos a extraer:**
- tipo: `PAGO_SERVICIO`
- monto: `6000`
- cuenta_origen: `*2997`
- destinatario_llave: `0091322191`
- fecha: `2026-05-25T16:16:00`
- comercio/descripcion: `Pago QR` (no hay nombre de comercio en este tipo)

**Patrón regex clave:**
```
pagaste \$([0-9,\.]+) por codigo QR desde tu cuenta \*?(\w+) a la llave (\w+) el (\d{2}/\d{2}/\d{4}) a las (\d{2}:\d{2})
```

> ⚠️ El nombre del titular aparece al inicio ("BRANDON NICK GOMEZ AYA pagaste...") — ignorarlo, no es el comercio.

---

## Tipo 4 — Compra con tarjeta débito

**Asunto:** Alertas y Notificaciones
**Fecha:** vie, 18 abr 2025, 2:05 p.m.

**Cuerpo relevante:**
```
Bancolombia: Compraste $6.790,00 en UBER *TRIP con tu T.Deb *1754, el 18/04/2025 a las 14:05. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.
```

**Campos a extraer:**
- tipo: `COMPRA`
- monto: `6790`
- comercio: `Uber Trip` (limpiar con toTitleCase, eliminar asterisco)
- tarjeta: `T.Deb *1754`
- fecha: `2025-04-18T14:05:00`

**Patrón regex clave:**
```
Compraste \$([0-9\.,]+) en ([A-Z0-9\s\*]+) con tu T\.Deb \*(\w+), el (\d{2}/\d{2}/\d{4}) a las (\d{2}:\d{2})
```

> ⚠️ Formato de monto inconsistente entre correos:
> - `$120,000.00` → comas como separador de miles, punto decimal
> - `$6.790,00` → puntos como separador de miles, coma decimal
> El parser debe normalizar ambos formatos al mismo número entero en COP.

---

## Notas importantes para el parser

### Normalización de montos
Bancolombia usa dos formatos distintos de número en sus correos:
```typescript
function parseMontoBancolombia(raw: string): number {
  // Formato A: $120,000.00 → eliminar comas, parsear como float
  // Formato B: $6.790,00 → eliminar puntos, reemplazar coma por punto
  const sinSigno = raw.replace('$', '').trim()
  if (sinSigno.includes(',') && sinSigno.includes('.')) {
    // Determinar cuál es el separador decimal por posición
    const ultimaComa = sinSigno.lastIndexOf(',')
    const ultimoPunto = sinSigno.lastIndexOf('.')
    if (ultimoPunto > ultimaComa) {
      // $120,000.00 → coma = miles, punto = decimal
      return Math.round(parseFloat(sinSigno.replace(/,/g, '')))
    } else {
      // $6.790,00 → punto = miles, coma = decimal
      return Math.round(parseFloat(sinSigno.replace(/\./g, '').replace(',', '.')))
    }
  }
  return Math.round(parseFloat(sinSigno.replace(/[,\.]/g, '')))
}
```

### Detección del sender
```typescript
// En BANK_SENDERS (lib/gmail/client.ts) agregar:
'alertasynotificaciones@an.notificacionesbancolombia.com': 'BANCOLOMBIA',
'alertasynotificaciones@notificacionesbancolombia.com': 'BANCOLOMBIA',
```

### Categorización sugerida por tipo
| Tipo | Categoría sugerida |
|---|---|
| COMPRA con T.Deb | Usar `guessCategoria(comercio)` igual que RappiCard |
| TRANSFERENCIA_ENVIADA | `TRANSFERENCIA` |
| TRANSFERENCIA_RECIBIDA | `INGRESO` si monto > umbral, sino `TRANSFERENCIA` |
| PAGO_SERVICIO (QR) | `HOGAR` como default, o `guessCategoria` si hay nombre |

### Tipos nuevos necesarios
El tipo `Banco` en `lib/types.ts` necesita agregar `'BANCOLOMBIA'`:
```typescript
type Banco = 'RAPPICARD' | 'RAPPIPAY' | 'BANCOLOMBIA' | 'OTRO'
```

---

## Correos pendientes de conseguir

Para hacer el parser más robusto, sería útil tener ejemplos de:
- [ ] Pago de servicios públicos (agua, luz, gas)
- [ ] Retiro en cajero
- [ ] Compra con tarjeta crédito Bancolombia (si aplica)
- [ ] Transferencia PSE
