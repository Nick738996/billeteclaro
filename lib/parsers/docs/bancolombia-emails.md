# Bancolombia — Formato de correos

**Sender:** `alertas@notificaciones.bancolombia.com.co`

---

## Formatos de monto

Bancolombia usa dos notaciones distintas según el contexto del correo:

| Ejemplo en correo | Formato          | `parseMontoBancolombia` retorna |
|-------------------|------------------|---------------------------------|
| `$120,000.00`     | coma=miles, punto=decimal (norteamericano) | `120000` |
| `$6.790,00`       | punto=miles, coma=decimal (europeo/colombiano) | `6790` |
| `$130,000`        | sin decimales    | `130000` |
| `$10.254.616`     | punto=miles, sin decimal | `10254616` |

**Regla:** siempre se retorna entero (`Math.floor`). Los centavos no existen en COP.

La función distingue el formato según la posición relativa del último punto y la última coma:
- `ultimoPunto > ultimaComa` → punto es decimal → eliminar comas, truncar en el punto
- `ultimaComa > ultimoPunto` → coma es decimal → eliminar puntos, reemplazar coma por punto
- Sin ambos (o posición igual) → sin decimales → eliminar ambos separadores

---

## Tipos de correo observados

### Compra con tarjeta débito / crédito
```
Asunto: Compra aprobada por $120,000.00
Cuerpo:
  Establecimiento: RAPPI COLOMBIA
  Valor:           $120,000.00
  Fecha:           07/06/2026
  Hora:            10:30
```

### Transferencia PSE / entre cuentas
```
Asunto: Transferencia realizada
Cuerpo:
  Descripción: Transferencia enviada
  Valor:       $500,000.00
  Fecha:       07 de junio de 2026
```

### Retiro cajero
```
Asunto: Retiro en cajero
Cuerpo:
  Valor:  $200,000.00
  Cajero: BANCOLOMBIA ZONA ROSA
  Fecha:  07/06/2026
```

### Pago de servicio / recaudo
```
Asunto: Pago de servicio aprobado
Cuerpo:
  Convenio: ENEL CODENSA
  Valor:    $130,000
  Fecha:    07/06/2026
```

---

## Integración pendiente

Para activar este parser en el pipeline de sync:

1. Agregar `'BANCOLOMBIA'` al tipo `Banco` en `lib/types.ts` y actualizar `BANCO_LABELS`
2. Reemplazar `'OTRO'` por `'BANCOLOMBIA'` en `parseBancolombia()` (`banco` field)
3. Registrar el sender en `BANK_SENDERS` en `lib/gmail/client.ts`:
   ```
   'alertas@notificaciones.bancolombia.com.co': 'BANCOLOMBIA'
   ```
4. Registrar el parser en `lib/parsers/index.ts`:
   ```typescript
   import { parseBancolombia } from './bancolombia'
   // ...
   BANCOLOMBIA: parseBancolombia,
   ```
