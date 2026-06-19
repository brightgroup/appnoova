# Noova 360 — Pricing interno y comercial

Documento de referencia para costos, márgenes y precios al cliente.  
**Última actualización:** junio 2026 · **Fase WhatsApp:** Twilio (Fase 0)  
**TRM de referencia:** $1 USD ≈ $4.200 COP

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

## 7. Precios al cliente (vigentes — fase lanzamiento)

### Consumo por acción

| Cada vez que… | Créditos | Precio COP | Tu costo | Margen |
|---------------|----------|------------|----------|--------|
| Escribes a **ORI** | 10 | **$10** | ~$3 | ~70% |
| Un visitante escribe en **Mi Link** | 20 | **$20** | ~$8 | ~60% |
| Llega o sales un **WhatsApp** (humano, sin IA) | 30 | **$30** | ~$21 | ~30% |
| La **IA responde en WhatsApp** | 60 | **$60** | ~$46 | ~23% |
| **ORI llena un formulario** | 50 | **$50** | ~$21 | ~58% |
| **ORI escanea un documento** | 90 | **$90** | ~$25 | ~72% |
| **ORI genera una cotización** | 70 | **$70** | ~$35 | ~50% |
| **Agente de voz** (por minuto) | 900 | **$900** | ~$210 | ~77% |

**Referencia competencia:** Dapta ~$73 COP por respuesta IA en WhatsApp. **Noova: $60** (lanzamiento).

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
| **Créditos incluidos** | **15.000** |
| **Incluye** | ORI, Mi Link, inbox, 1 agente de texto |
| **No incluye** | WhatsApp en plan prueba (disponible al activar plan de pago) |

**Equivale aprox. a:**
- ~**500** mensajes de texto con IA (promedio ~$30), o
- ~**1.500** mensajes a ORI ($10 c/u), o
- ~**250** respuestas solo en WhatsApp ($60 c/u)

**Copy landing:**  
*Prueba Noova 14 días sin tarjeta. 15.000 créditos para ORI, tu link web e inbox.*

---

### Plan **Esencial** — $82 USD/mes

| | |
|---|---|
| **Precio** | **$82 USD/mes** (~$344.000 COP) |
| **Créditos incluidos** | **350.000 / mes** |
| **Ideal para** | Corredor independiente o agencia pequeña (1–3 asesores) |
| **Incluye** | ORI, Mi Link, inbox, CRM con ia, agentes de texto, **hasta 5 usuarios**, soporte por email |

**Equivale aprox. a:**
- ~**11.600** mensajes de texto con IA (promedio ~$30), o
- ~**35.000** mensajes a ORI, o
- ~**5.800** respuestas solo en WhatsApp ($60 c/u)

**Copy landing:**  
*Todo lo esencial para empezar: copiloto ORI, link web con IA e inbox. Desde $82/mes.*

---

### Plan **Crecimiento** — $345 USD/mes

| | |
|---|---|
| **Precio** | **$345 USD/mes** (~$1.449.000 COP) |
| **Créditos incluidos** | **1.500.000 / mes** |
| **Ideal para** | Agencia en crecimiento (6–15 asesores) |
| **Incluye** | Misma plataforma que Esencial + **1.500.000 créditos** + **hasta 15 usuarios** + soporte prioritario |

**Equivale aprox. a:**
- ~**50.000** mensajes de texto con IA (promedio ~$30), o
- ~**150.000** mensajes a ORI, o
- ~**25.000** respuestas solo en WhatsApp ($60 c/u)

**Copy landing:**  
*Para agencias que ya operan volumen: más créditos, más agentes, soporte prioritario.*

---

### Plan **Escala** — $815 USD/mes

| | |
|---|---|
| **Precio** | **$815 USD/mes** (~$3.423.000 COP) |
| **Créditos incluidos** | **3.800.000 / mes** |
| **Ideal para** | Agencias con equipo grande o alto volumen de consumo |
| **Incluye** | Misma plataforma + **3.800.000 créditos** + **usuarios ilimitados** + soporte dedicado |

**Equivale aprox. a:**
- ~**126.600** mensajes de texto con IA (promedio ~$30), o
- ~**380.000** mensajes a ORI, o
- ~**63.300** respuestas solo en WhatsApp ($60 c/u)

**Copy landing:**  
*Máximo volumen para operaciones grandes: escaneo, formularios, WhatsApp e IA a escala.*

---

## 9. Tabla comparativa de planes (cliente)

| | **Explorador** | **Esencial** | **Crecimiento** | **Escala** |
|---|:---:|:---:|:---:|:---:|
| **Precio/mes** | $0 | **$82** | **$345** | **$815** |
| **Créditos/mes** | 15.000 | 350.000 | 1.500.000 | 3.800.000 |
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
→ **~30 créditos (~$30 COP) por mensaje de texto promedio**

| Plan | Créditos | ≈ Mensajes texto (promedio ~$30) |
|------|----------|----------------------------------|
| Prueba | 15.000 | ~500 |
| Inicio | 350.000 | ~11.600 |
| Profesional | 1.500.000 | ~50.000 |
| Agencia | 3.800.000 | ~126.600 |

### Sección «Créditos reales por canal»

| Canal | Créditos | Precio |
|-------|----------|--------|
| ORI | 10 | **$10** |
| Mi Link | 20 | **$20** |
| WhatsApp con IA | 60 | **$60** |
| **Promedio mix típico** | **~30** | **~$30** |

### Sección «Otros consumos»

### CTAs
- **Empezar prueba gratis** (14 días · 15.000 créditos)
- **WhatsApp:** conexión sin costo adicional en lanzamiento

---

## 12. Margen estimado si el cliente usa el 100% de créditos

Mix típico agencia de seguros (referencia interna):

| Tipo | % créditos |
|------|------------|
| WhatsApp con IA | 50% |
| ORI | 18% |
| Documentos | 13% |
| Mi Link | 8% |
| WhatsApp manual | 6% |
| Formularios | 4% |
| Cotizaciones | 1% |

Costo promedio ponderado: **~$0,59 COP por crédito consumido**.

| Plan | Ingreso (USD) | Ingreso (~COP) | Créditos | Costo variable est. | Margen est. |
|------|---------------|----------------|----------|---------------------|-------------|
| Prueba | $0 | $0 | 15.000 | ~$8.850 | Adquisición |
| Inicio | $82 | ~$344.000 | 350.000 | ~$206.500 | **~$137.500 (40%)** |
| Profesional | $345 | ~$1.449.000 | 1.500.000 | ~$885.000 | **~$564.000 (39%)** |
| Agencia | $815 | ~$3.423.000 | 3.800.000 | ~$2.242.000 | **~$1.181.000 (35%)** |

**Peor caso** (100% WhatsApp con IA a $60): margen ~23% por mensaje — viable en lanzamiento; subir precio o migrar a 360dialog cuando escale el volumen.

---

## 13. Decisiones pendientes

- [ ] Migrar WhatsApp de Twilio → 360dialog Partner (~10–15 clientes activos pagando)
- [ ] Revisar precio WhatsApp con IA ($60 → $65–70) post-lanzamiento
- [x] Implementar wallet/créditos en base de datos (migración 041 — créditos mensuales no acumulables, medición en tiempo real, suspensión automática)
- [ ] Conectar pasarela de pago (hoy el pago se marca manual desde /admin/billing)
- [ ] Definir cobro en COP vs USD en pasarela de pago

---

## 14. Changelog

| Fecha | Cambio |
|-------|--------|
| Jun 2026 | Documento inicial. WA Fase 0 Twilio. WhatsApp IA a $60 (lanzamiento). Planes $0 / $82 / $345 / $815 USD. |
| Jun 2026 | Sistema de consumo/facturación (migración 041): planes en BD, billetera de créditos mensual no acumulable, ledger `usage_events` con costo real vs cobro, facturas + suspensión automática, panel cliente (/dashboard/facturacion) y panel proveedor (/admin/billing). IDs de plan: explorador/esencial/crecimiento/escala. |
