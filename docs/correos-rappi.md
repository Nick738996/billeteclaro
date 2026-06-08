# Correos de Rappi — Muestras para el Parser

Archivo de referencia con el texto exacto de cada tipo de correo que envía Rappi.
Usado para construir y validar los parsers en `lib/parsers/`.

---

## 1. RappiPay — Transferencia recibida con llave

- **Remitente:** `noreply@rappipay.co`
- **Asunto:** Tu dinero ya está disponible.
- **Banco detectado:** `RAPPIPAY`
- **Tipo:** `TRANSFERENCIA_RECIBIDA`
- **Campos clave:** `Monto recibido`, `Banco` (origen), `Nro. de transacción`, `Fecha de la transacción`, `Hora de la transacción`

```
¡Hola, Brandon Nick!

¡Recibiste una transferencia de dinero directamente en tu RappiCuenta!
Esta transferencia se realizó a través de tus llaves.

Aquí los detalles:

Monto recibido
$1.050.000

Banco
Bancolombia

Nro. de transacción
1677974

Fecha de la transacción
02 de mayo de 2026

Hora de la transacción
03:18 pm

¿Necesitas ayuda?
Escríbenos desde tu app, estamos 24/7.
```

---

## 2. RappiPay — Transferencia enviada con llave

- **Remitente:** `noreply@rappipay.co`
- **Asunto:** ¡Listo! Tu dinero está en camino
- **Banco detectado:** `RAPPIPAY`
- **Tipo:** `TRANSFERENCIA_ENVIADA`
- **Campos clave:** `Monto transferido`, `Llave destino` (destinatario), `Banco`, `Fecha de la transacción`, `Hora de la transacción`

```
¡Hola, Brandon Nick!

¡Tu transferencia fue enviada con éxito! La persona que tiene la llave que usaste,
ya recibió el dinero sin ningún problema.

Aquí los detalles:

Monto transferido
$400.000,00

RappiCuenta de origen
****9514

Llave destino
@nestor2058

Cuenta destino
****2747

Banco
Bancolombia

Costo de la transacción
Gratis

Nro. de transacción
2218478

Descripción
Transferencia interbancaria

Fecha de la transacción
01 de mayo de 2026

Hora de la transacción
06:33 pm

¿Necesitas ayuda?
Escríbenos desde tu app, estamos 24/7.
```

---

## 3. RappiPay — Rentabilidad mensual

- **Remitente:** `noreply@rappipay.co`
- **Asunto:** Resumen de remuneración en tu RappiCuenta
- **Banco detectado:** `RAPPIPAY`
- **Tipo:** `INGRESO` (rendimiento de cuenta)
- **Campos clave:** `Rentabilidad de [Mes]`, `Fecha de corte`, `Intereses retenidos`
- **Nota:** El monto a registrar es `Rentabilidad de [Mes]` (bruto), no el neto.

```
¡Hola, Brandon Nick!
Este es el resumen de la rentabilidad que ganaste este mes por ahorrar en tu cuenta:

Aquí los detalles:

Rentabilidad de Abril
$203.770,46

Fecha de corte
30 de abril de 2026

Intereses retenidos
$14.263,89

¿Necesitas ayuda?
Escríbenos desde tu app, estamos 24/7.
```

---

## 4. RappiPay — Depósito bancario (sueldo / nómina)

- **Remitente:** `noreply@rappipay.co`
- **Asunto:** Resumen transferencia Bancaria
- **Banco detectado:** `RAPPIPAY`
- **Tipo:** `INGRESO`
- **Campos clave:** `Monto recibido`, `Cuenta de origen`, `Banco` (origen), `No. de transacción`, `Fecha de la transacción`, `Hora de la transacción`
- **Diferencia con tipo 1:** No hay "llave", viene de una cuenta bancaria externa.

```
¡Hola, Brandon Nick!
Te hicieron una transferencia bancaria a tu RappiCuenta.

Aquí los detalles:

Monto recibido
$24.208.992

Cuenta de origen
88617029

Banco
BANCO CITIBANK COLOMBIA

No. de transacción
37767000

Fecha de la transacción
29 de abril de 2026

Hora de la transacción
10:04 am

¿Necesitas ayuda?
Escríbenos desde tu app, estamos 24/7.
```

---

## 5. RappiPay — Pago de servicio (ENEL / utilidades)

- **Remitente:** `noreply@holdingrappipay.co`
- **Asunto:** RappiPay - Resumen de Pago a Servicio - ENEL
- **Banco detectado:** `RAPPIPAY`
- **Tipo:** `PAGO_SERVICIO`
- **Campos clave:** `Convenio` (nombre del servicio), `Pago total`, `Fecha y hora`
- **Nota:** Formato de fecha distinto: `19:36 hrs, 27 Abr. 2026`
- **Nota:** El campo `Comercio` en este correo es un código numérico (554960) — usar `Convenio` como nombre del comercio.
- **Nota:** Monto con coma como separador de miles: `$282,230` = $282.230 COP

```
¡Hola, Brandon!
Te compartimos los datos de tu pago de servicio.

Detalles de transacción

Nombre del cliente
Brandon Gómez

Tipo de transacción
Pago de Servicio

Convenio
ENEL

Referencia
70380696

Método de pago
CARD

Monto de recibo
$282,230

Comisión
$0

Pago total
$282,230

Fecha y hora
19:36 hrs, 27 Abr. 2026

Aprobación
1423387656

Corresponsal bancario
CORRESPONSAL BANCARIO DAVIBANK
```

---

## 6. RappiCard — Compra en comercio

- **Remitente:** `noreply@rappicard.co`
- **Asunto:** Resumen de transacción
- **Banco detectado:** `RAPPICARD`
- **Tipo:** `COMPRA`
- **Campos clave:** `Monto` (con $), `Comercio` (nombre explícito), `No. de autorización`, `Fecha de la transacción` (ISO)
- **Nota:** El comercio viene etiquetado explícitamente — campo más confiable del parser.
- **Nota:** Fecha en formato ISO: `2026-06-07 12:25:21`

```
¡Hola, BRANDON NICK GOMEZ AYA!
Realizaste una compra con tu RappiCard.

Detalle de tu transacción:

Monto
$17.934

Método de pago
*8021

No. de autorización
116056

Comercio
Uber

Fecha de la transacción
2026-06-07 12:25:21

¿Necesitas ayuda?
Escríbenos desde tu app, estamos 24/7.
```

---

## 7. RappiCard — Pago de tarjeta (RappiCuenta → RappiCard)

- **Remitente:** `noreply@rappicard.co`
- **Asunto:** Comprobante de pago
- **Banco detectado:** `RAPPICARD`
- **Tipo:** `ABONO_DEUDA`
- **Campos clave:** `Monto` (sin $, con punto+coma), `Destino de pago`, `Fecha y hora`
- **Nota:** El monto NO tiene signo `$`. Formato: `114.184,57`
- **Nota:** Formato de fecha: `04 jun 2026 15:20`

```
Hola, BRANDON NICK

Recibimos el pago de tu tarjeta y lo estamos procesando.
Sigue disfrutando todos los beneficios de tu RappiCard.

Destino de pago
*4894

Fecha y hora
04 jun 2026 15:20

Método de pago
Balance

Monto
114.184,57
```
