# Noova 360 — Pricing interno y comercial

Documento de referencia para costos, márgenes y precios al cliente.  
**Última actualización:** 22 ago 2026 · **Fase WhatsApp:** Twilio (Fase 0)

**TRM: ya NO es un valor fijo de referencia.** Desde la migración 041 el sistema sincroniza
la TRM oficial (Superfinanciera, vía `datos.gov.co`) automáticamente cada hora antes de
cobrar (`src/lib/billing/trm-colombia.ts` → `syncOfficialTrm`), y la guarda en
`billing_settings.trm_cop`. Los créditos que se cobran por cada acción están fijos **en
COP** (`billing_unit_prices.credits_cop`); lo único que se recalcula con la TRM es su
equivalente en USD para mostrarlo en el panel — el consumo del cliente en créditos no se
mueve por la TRM. Snapshot al momento de escribir esto: **TRM $3.048,12 COP** (vigente
2026-08-22). Los números de créditos y precios por acción de este documento son una
fotografía de esa fecha — para el valor en vivo, consultar `billing_settings` y
`billing_unit_prices` (o el panel `/admin/pricing`), no este archivo.

---

## 1. Stack y proveedores

| Pieza | Proveedor | Modelo / nota |
|-------|-----------|---------------|
| **ORI** (copiloto interno) | Google AI | `gemini-2.5-flash` |
| **Mi Link** (chat web visitante) | Google AI | `gemini-2.5-flash` + prompt del agente |
| **WhatsApp** | **Twilio** | $0.005 USD/msg + Gemini para IA |
| **Voz** | **Telnyx** + Google AI | Gemini Live native audio |
| Escaneo / formularios / cotización | Por implementar | Gemini flash + visión/PDF |

**Precios Gemini (pago):** $0.30 / millón tokens entrada · $2.50 / millón salida (texto).

**Twilio WhatsApp:** $0.005 USD por cada mensaje (entrante y saliente). Meta cobra $0 en texto libre dentro de ventana 24h (soporte).

**Roadmap proveedor WA:** Twilio ahora → 360dialog Partner cuando haya ~$2.5M COP/mes recurrente.

---

## 2. Costos internos (lo que paga Noova)

### WhatsApp (Twilio)

| Acción | Qué pasa | USD | COP |
|--------|----------|-----|-----|
| **1 mensaje WhatsApp** (entra o sale, sin IA) | 1 msg Twilio | $0.005 | ~$21 |
| **Cliente escribe + IA responde** | 2 msgs Twilio + Gemini | ~$0.011 | ~$46 |
| *(desglose)* Twilio ×2 | | $0.010 | $42 |
| *(desglose)* Gemini | | ~$0.001 | ~$4 |

### ORI (copiloto) — en producción

| Acción | USD | COP |
|--------|-----|-----|
| **1 mensaje ORI** (pregunta + respuesta, chat corto) | ~$0.0007 | ~$3 |
| Consulta larga (mucho contexto) | ~$0.002 | ~$8 |

### Mi Link (visitante web) — en producción

| Acción | USD | COP |
|--------|-----|-----|
| **1 mensaje web** (visitante + respuesta IA) | ~$0.002 | ~$8 |
| Conversación larga (historial acumulado) | ~$0.004 | ~$17 |

### ORI — escaneo de documento (estimado)

| Acción | USD | COP |
|--------|-----|-----|
| **1 documento simple** (1 página) | ~$0.004 | ~$17 |
| **1 documento complejo** (varias páginas) | ~$0.010 | ~$42 |

### ORI — llenado de formulario (estimado)

| Acción | USD | COP |
|--------|-----|-----|
| **1 formulario** | ~$0.005 | ~$21 |
| Formulario grande | ~$0.008 | ~$34 |

### ORI — cotización (estimado)

| Acción | USD | COP |
|--------|-----|-----|
| **1 cotización simple** | ~$0.007 | ~$29 |
| **1 cotización compleja** | ~$0.015 | ~$63 |

### Llamadas de voz (Telnyx + Gemini Live) — en producción

| Acción | USD | COP |
|--------|-----|-----|
| **1 minuto de llamada con agente IA** | ~$0.05 | ~$210 |
| Llamada de 3 minutos | ~$0.15 | ~$630 |

---

## 3. Resumen de costos internos (COP)

| Acción | Costo típico Noova |
|--------|-------------------|
| 1 mensaje WhatsApp (solo Twilio) | **$21** |
| 1 mensaje WhatsApp + respuesta IA | **$46** |
| 1 mensaje ORI | **$3** |
| 1 mensaje Mi Link | **$8** |
| 1 documento escaneado | **$17–42** |
| 1 formulario llenado | **$21–34** |
| 1 cotización | **$29–63** |
| 1 minuto llamada voz | **~$210** |

**Lo más barato:** ORI → Mi Link → documentos/formularios.  
**Lo más caro:** WhatsApp con IA → voz.

---

## 4. Estrategia de margen

### Metas globales

| Etapa | Margen bruto objetivo |
|-------|------------------------|
| Primeros clientes (ahora) | **45–55%** |
| Con volumen (6+ meses) | **60–70%** |
| ORI / web / documentos | **65–80%** |
| WhatsApp | **35–45%** (Twilio aprieta; promo lanzamiento al 23%) |
| Voz | **40–50%** |

### Multiplicador sobre costo (referencia interna)

| Tipo | Costo COP | Multiplicador | Precio referencia |
|------|-----------|---------------|-------------------|
| ORI | ~$3 | ×3 | $9–10 |
| Mi Link | ~$8 | ×2.5 | $20 |
| WhatsApp manual | ~$21 | ×1.4 | $29–30 |
| WhatsApp + IA | ~$46 | ×1.3 (lanzamiento) | **$60** |
| Documento | ~$25 prom. | ×3 | $75–95 |
| Formulario | ~$21 | ×2.5 | $50–55 |
| Cotización | ~$35 prom. | ×2 | $70–75 |
| Minuto voz | ~$210 | ×4.3 | $900 |

**Regla:** margen mínimo global **40%** en promedio. No bajar WhatsApp con IA de **$60** en fase de lanzamiento; revisar cuando migremos a 360dialog.

---

## 5. Ejemplo de costo mensual (agencia activa)

Solo APIs variables — sin Supabase/hosting.

| Uso | Cantidad | Costo unit. | Total COP |
|-----|----------|-------------|-----------|
| ORI | 2.000 msgs | $3 | $6.000 |
| Mi Link | 400 msgs | $8 | $3.200 |
| WhatsApp + IA | 800 intercambios | $46 | $36.800 |
| Documentos | 100 | $25 prom. | $2.500 |
| Formularios | 80 | $21 | $1.680 |
| Cotizaciones | 50 | $29 | $1.450 |
| Voz | 60 min | $210 | $12.600 |
| **Total variable** | | | **~$64.230** |

---

## 6. Regla comercial: créditos

> **1 crédito = $1 peso colombiano**

Un solo saldo para ORI, Mi Link, WhatsApp, documentos, formularios, cotizaciones y voz.  
El cliente no ve proveedores, categorías Meta ni tipos de mensaje Twilio.

---

## 7. Precios al cliente (vigentes — snapshot 2026-08-22)

### Consumo por acción

Precios (`credits_cop`) tomados en vivo de `billing_unit_prices`. El costo real se
reconvierte a COP con la TRM vigente ($3.048,12) a partir del USD fijo de la sección 2 —
como el USD real no cambió pero la TRM bajó y los créditos subieron desde el precio de
lanzamiento, el margen por acción mejoró frente a los números originales de junio.

| Cada vez que… | Créditos | Precio COP | Tu costo (COP, TRM viva) | Margen |
|---------------|----------|------------|---------------------------|--------|
| Escribes a **ORI** | 15,45 | **$15** | ~$2 | ~86% |
| Un visitante escribe en **Mi Link** | 19,57 | **$20** | ~$6 | ~70% |
| Llega o sales un **WhatsApp** (humano, sin IA) | 29,87 | **$30** | ~$15 | ~49% |
| La **IA responde en WhatsApp** | 72,11 | **$72** | ~$34 | ~53% |
| **ORI llena un formulario** | 50,48 | **$50** | ~$15 | ~70% |
| **ORI escanea un documento** | 89,62 | **$90** | ~$18 | ~80% |
| **ORI genera una cotización** | 90,00 | **$90** | ~$25 | ~72% |
| **Agente de voz** (por minuto) | 927,10 | **$927** | ~$152 | ~84% |

**Referencia competencia:** Dapta ~$73 COP por respuesta IA en WhatsApp. **Noova: ~$72** (equivalente tras el ajuste de precios).

**Activación WhatsApp:** sin cargo adicional en fase de lanzamiento (onboarding manual incluido).

---

## 8. Planes mensuales (presentación al cliente)

Precios en **USD/mes**. Créditos en **pesos colombianos** (1 cr = $1 COP).  
Pago en COP al TRM del día o equivalente acordado.

---

### Plan **Explorador** — $0

| | |
|---|---|
| **Precio** | **Gratis · 14 días** |
| **Créditos incluidos** | **8.500** |
| **Incluye** | ORI, Mi Link, inbox, 1 agente de texto |
| **No incluye** | WhatsApp en plan prueba (disponible al activar plan de pago) |

**Equivale aprox. a:**
- ~**236** mensajes de texto con IA (promedio ~$36), o
- ~**550** mensajes a ORI ($15 c/u), o
- ~**118** respuestas solo en WhatsApp ($72 c/u)

**Copy landing:**  
*Prueba Noova 14 días sin tarjeta. 15.000 créditos para ORI, tu link web e inbox.*

---

### Plan **Esencial** — $82 USD/mes

| | |
|---|---|
| **Precio** | **$82 USD/mes** (~$250.000 COP a TRM viva $3.048) |
| **Créditos incluidos** | **273.333 / mes** |
| **Ideal para** | Corredor independiente o agencia pequeña (1–3 asesores) |
| **Incluye** | ORI, Mi Link, inbox, CRM con ia, agentes de texto, **hasta 5 usuarios**, soporte por email |

**Equivale aprox. a:**
- ~**7.593** mensajes de texto con IA (promedio ~$36), o
- ~**17.690** mensajes a ORI, o
- ~**3.791** respuestas solo en WhatsApp ($72 c/u)

**Copy landing:**  
*Todo lo esencial para empezar: copiloto ORI, link web con IA e inbox. Desde $82/mes.*

---

### Plan **Crecimiento** — $345 USD/mes

| | |
|---|---|
| **Precio** | **$345 USD/mes** (~$1.051.600 COP a TRM viva $3.048) |
| **Créditos incluidos** | **1.456.151 / mes** |
| **Ideal para** | Agencia en crecimiento (6–15 asesores) |
| **Incluye** | Misma plataforma que Esencial + **1.456.151 créditos** + **hasta 15 usuarios** + soporte prioritario |

**Equivale aprox. a:**
- ~**40.449** mensajes de texto con IA (promedio ~$36), o
- ~**94.251** mensajes a ORI, o
- ~**20.193** respuestas solo en WhatsApp ($72 c/u)

> ⚠️ Este cupo de créditos no se ha reajustado desde que se creó el plan (su ratio
> créditos/USD implica una TRM de ~$4.220, muy por encima de la TRM viva de $3.048).
> Esencial y Básico sí fueron reajustados recientemente (ratio ~$3.333). Ver §13.

**Copy landing:**  
*Para agencias que ya operan volumen: más créditos, más agentes, soporte prioritario.*

---

### Plan **Escala** — $815 USD/mes

| | |
|---|---|
| **Precio** | **$815 USD/mes** (~$2.484.200 COP a TRM viva $3.048) |
| **Créditos incluidos** | **3.688.916 / mes** |
| **Ideal para** | Agencias con equipo grande o alto volumen de consumo |
| **Incluye** | Misma plataforma + **3.688.916 créditos** + **usuarios ilimitados** + soporte dedicado |

**Equivale aprox. a:**
- ~**102.470** mensajes de texto con IA (promedio ~$36), o
- ~**238.765** mensajes a ORI, o
- ~**51.157** respuestas solo en WhatsApp ($72 c/u)

> ⚠️ Igual que Crecimiento: cupo calculado con una TRM de ~$4.526, sin reajustar. Ver §13.

**Copy landing:**  
*Máximo volumen para operaciones grandes: escaneo, formularios, WhatsApp e IA a escala.*

---

## 9. Tabla comparativa de planes (cliente)

| | **Explorador** | **Esencial** | **Crecimiento** | **Escala** |
|---|:---:|:---:|:---:|:---:|
| **Precio/mes** | $0 | **$82** | **$345** | **$815** |
| **Créditos/mes** | 8.500 | 273.333 | 1.456.151 | 3.688.916 |
| **Duración** | 14 días | Mensual | Mensual | Mensual |
| ORI copiloto | ✅ | ✅ | ✅ | ✅ |
| Mi Link (web) | ✅ | ✅ | ✅ | ✅ |
| Inbox | ✅ | ✅ | ✅ | ✅ |
| WhatsApp + IA | — | ✅ | ✅ | ✅ |
| Agentes de texto | 1 | Ilimitados | Ilimitados | Ilimitados |
| Usuarios en equipo | 1 | **5 máx.** | **15 máx.** | **Ilimitados** |
| CRM contactos/leads con ia | — | ✅ | ✅ | ✅ |
| Escaneo / formularios / cotizaciones | ✅ | ✅ | ✅ | ✅ |
| Agente de voz | Próximamente | Próximamente | Próximamente | Próximamente |
| Soporte | Email | Email | Prioritario | Dedicado |

**WhatsApp:** conexión incluida sin cargo adicional en fase de lanzamiento (onboarding manual).

**Corporativo:** empresas que superen Escala en volumen o requisitos especiales → plan a medida (fuera de esta tabla).

**Lógica de upgrade:** mismo producto en los tres planes de pago; sube de plan cuando crece el **equipo** (usuarios) o el **consumo mensual** (créditos).

---

## 10. Recargas (top-up)

Si se acaban los créditos antes de fin de mes:

| Recarga | Precio USD | Créditos |
|---------|------------|----------|
| **S** | $20 | 22.000 |
| **M** | $50 | 58.000 |
| **L** | $100 | 120.000 |

Créditos del plan válidos **60 días** desde la fecha de compra.

---

## 11. Cómo presentarlo en la landing

### Headline
**Planes claros en dólares. Consumo en pesos.**

### Subheadline
Un solo saldo de créditos para ORI, tu link web, WhatsApp y documentos.  
Los planes se presentan con **~$30 por mensaje de texto (promedio mix)**.  
Desglose real: ORI **$10** · Mi Link **$20** · WhatsApp IA **$60**.

### Mensaje promedio (protagonista en landing)

Mix típico corredor: **45% ORI + 20% Mi Link + 35% WhatsApp IA**  
→ **~36 créditos (~$36 COP) por mensaje de texto promedio** (snapshot 2026-08-22, precios en vivo)

| Plan | Créditos | ≈ Mensajes texto (promedio ~$36) |
|------|----------|----------------------------------|
| Prueba | 8.500 | ~236 |
| Inicio | 273.333 | ~7.593 |
| Profesional | 1.456.151 | ~40.449 |
| Agencia | 3.688.916 | ~102.470 |

### Sección «Créditos reales por canal»

| Canal | Créditos | Precio |
|-------|----------|--------|
| ORI | 15,45 | **$15** |
| Mi Link | 19,57 | **$20** |
| WhatsApp con IA | 72,11 | **$72** |
| **Promedio mix típico** | **~36** | **~$36** |

### Sección «Otros consumos»

### CTAs
- **Empezar prueba gratis** (14 días · 15.000 créditos)
- **WhatsApp:** conexión sin costo adicional en lanzamiento

---

## 12. Margen estimado si el cliente usa el 100% de créditos

Mix típico agencia de seguros (referencia interna, sin cambios):

| Tipo | % créditos |
|------|------------|
| WhatsApp con IA | 50% |
| ORI | 18% |
| Documentos | 13% |
| Mi Link | 8% |
| WhatsApp manual | 6% |
| Formularios | 4% |
| Cotizaciones | 1% |

Recalculado con los precios en vivo de §7 y la TRM viva ($3.048,12) — el costo real en USD
de cada acción (sección 2) no cambió, pero los créditos se repreciaron al alza y la TRM
bajó, así que el margen mejoró bastante frente al estimado original de junio.

Costo promedio ponderado: **~$0,353 COP por crédito consumido** (antes ~$0,59).

| Plan | Ingreso (USD) | Ingreso (~COP a TRM viva) | Créditos | Costo variable est. | Margen est. |
|------|---------------|----------------------------|----------|---------------------|-------------|
| Prueba | $0 | $0 | 8.500 | ~$3.000 | Adquisición |
| Inicio (Esencial) | $82 | ~$249.946 | 273.333 | ~$96.486 | **~$153.460 (61%)** |
| Profesional (Crecimiento) | $345 | ~$1.051.601 | 1.456.151 | ~$514.072 | **~$537.529 (51%)** |
| Agencia (Escala) | $815 | ~$2.484.218 | 3.688.916 | ~$1.302.192 | **~$1.182.026 (48%)** |

Nota: Crecimiento y Escala salen con margen más bajo que Esencial en este escenario porque
su cupo de créditos está sobredimensionado (calculado con TRM ~$4.200-4.526, nunca
reajustado — ver aviso en §8 y pendiente en §13); no es que esos planes sean intrínsecamente
menos rentables.

**Peor caso real** (100% créditos en WhatsApp con IA únicamente, a $72/cr): costo
≈$33,53 COP/crédito → margen ~53% por mensaje en ese canal — sigue siendo mejor que el ~23%
original porque el precio de ese canal subió de $60 a $72,11 desde el lanzamiento.

**Importante:** como el precio al cliente por acción está fijo en COP y el costo real del
proveedor está fijo en USD, una TRM más baja (peso fuerte) **mejora** el margen por crédito
consumido — no lo empeora. La TRM no afecta el margen del plan en sí ($82 USD de ingreso
menos el costo real en USD es fijo); solo afecta cuánto vale ese margen al convertirlo a
pesos para reportes internos.

---

## 13. Decisiones pendientes

- [ ] Migrar WhatsApp de Twilio → 360dialog Partner (~10–15 clientes activos pagando)
- [x] Revisar precio WhatsApp con IA ($60 → $72,11 en `billing_unit_prices`, ya ajustado)
- [x] Implementar wallet/créditos en base de datos (migración 041 — créditos mensuales no acumulables, medición en tiempo real, suspensión automática)
- [ ] Conectar pasarela de pago (hoy el pago se marca manual desde /admin/billing)
- [ ] Definir cobro en COP vs USD en pasarela de pago
- [ ] **Reajustar `monthly_credits` de Crecimiento y Escala.** Esencial y Básico ya se
      recalcularon a una TRM ~$3.333 (créditos/USD), pero Crecimiento (ratio ~$4.220) y
      Escala (ratio ~$4.526) siguen con el cupo calculado a la TRM de lanzamiento — les
      estamos regalando proporcionalmente más créditos que a Esencial. `monthly_credits`
      en `plans` no se resincroniza solo con la TRM (a diferencia de `price_usd` en
      `billing_unit_prices`, que sí); requiere un ajuste manual o un job nuevo.

---

## 14. Changelog

| Fecha | Cambio |
|-------|--------|
| Jun 2026 | Documento inicial. WA Fase 0 Twilio. WhatsApp IA a $60 (lanzamiento). Planes $0 / $82 / $345 / $815 USD. |
| Jun 2026 | Sistema de consumo/facturación (migración 041): planes en BD, billetera de créditos mensual no acumulable, ledger `usage_events` con costo real vs cobro, facturas + suspensión automática, panel cliente (/dashboard/facturacion) y panel proveedor (/admin/billing). IDs de plan: explorador/esencial/crecimiento/escala. |
| 22 ago 2026 | Corregido: la TRM de referencia ($4.200) estaba desactualizada — el sistema sincroniza la TRM oficial automáticamente (`syncOfficialTrm`, cada hora, fuente `datos.gov.co`) y ya no es un valor fijo. Actualizados créditos por plan, precios por acción y tabla de márgenes con los valores en vivo (TRM $3.048,12). Detectado: Crecimiento/Escala no se han reajustado desde el lanzamiento (pendiente en §13). |
