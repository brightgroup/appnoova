# WhatsApp coexistencia — contexto de producto (pendiente de implementar)

> **Estado:** decisión de producto acordada; **no implementar aún**. Retomar con el
> próximo cliente que requiera línea legacy en celular + Noova.
>
> **Última actualización:** 2025-06 (conversación producto + doc Meta).

---

## Decisión explícita

- **No migrar historial** del WhatsApp Business app al conectar.
- **No** vender “migración” — vender **conexión + IA/inbox encima**.
- Implementación completa (coexistencia + billing + reglas) **diferida** hasta cliente piloto.

---

## Qué es coexistencia (Meta)

Mismo número en **WhatsApp Business app (celular)** y **Cloud API (Noova)** a la vez.

- Doc: [Onboard WhatsApp Business app users](https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/)
- Embedded Signup con `featureType: "whatsapp_business_app_onboarding"`.
- Webhooks extra: `smb_message_echoes`, `smb_app_state_sync`, `history` (history opcional; **no usaremos import**).
- Requisitos: app ≥ 2.24.17, negocio verificado, Tech Provider, webhooks.

### En Noova hoy vs falta

| Pieza | Estado |
|-------|--------|
| Embedded Signup estándar (`FINISH`, auth_code race fix) | ✅ |
| Resolver número vía Graph sin `display_phone_number` | ✅ |
| `featureType` coexistencia en modal | ❌ |
| Webhooks `smb_message_echoes`, `smb_app_state_sync` | ❌ |
| Sync historial post-onboarding | ❌ (descartado por producto) |
| Pausa IA al escribir desde celular | ❌ |
| `default_handoff_mode` / `ai_solo_nuevos` en canal | ❌ |
| Parsear `referral` (CTWA) en webhook | ❌ |
| Marcar canal `pending` según estado Meta real | ❌ (Meta directo marca `active` de inmediato) |

---

## Reglas Meta: ventana 24 h, inbox y cobro

### Ventana de servicio al cliente (CSW, 24 h)

- Se **abre** cuando el **cliente escribe** al negocio (línea ya en Cloud API).
- Se **reinicia** si vuelve a escribir antes de 24 h.
- **Solo limita envíos por API** sin plantilla.

**Coexistencia (cita Meta):** mensajes desde la **app Business no están sujetos** a la CSW **ni la abren, extienden ni afectan** ni el pricing de API.

### Qué entra al inbox de Noova

| Evento | Inbox | CSW API |
|--------|-------|---------|
| Cliente escribe | ✅ `messages` webhook | Abre/reinicia |
| Tú escribes primero desde celular, él no responde | ❌ (hasta eco o respuesta) | No abierta |
| Él responde a tu “hola” del celular | ✅ | Abre |
| Tú respondes desde celular | ✅ cuando exista handler de `smb_message_echoes` | No afecta CSW |
| Chats solo en celular antes de conectar API | ❌ sin sync (y no haremos sync) | — |

### Cobro Meta ([pricing](https://developers.facebook.com/docs/whatsapp/pricing/))

- **Entrantes del cliente:** gratis.
- **Texto/imagen por API dentro de CSW:** gratis (mensaje de servicio).
- **Plantillas por API:** cobran según categoría (marketing casi siempre; utility fuera de CSW, etc.).
- **Mensajes desde app Business (coexistencia):** **gratis** respecto a Cloud API pricing.

**Resumen para el cliente:** ventana cerrada → celular sigue pudiendo escribir gratis; Noova/API solo con **plantilla** (y Meta cobra plantilla).

---

## Facturación Noova (propuesta con coexistencia)

**Hoy en código:** `whatsapp_ai` (60 créditos), `whatsapp_manual` (30 créditos) al procesar/enviar por plataforma.

**Regla acordada para coexistencia:**

| Acción | ¿Cobra Noova? | ¿Cobra Meta? |
|--------|---------------|--------------|
| Cliente escribe → solo inbox | No | No |
| IA responde por Noova/API | Sí (`whatsapp_ai`) | No (texto en ventana) |
| Humano responde desde inbox Noova | Sí (`whatsapp_manual`) | No (en ventana) |
| Humano responde desde celular | **No** | No |
| Plantilla desde Noova | Sí (servicio; margen opcional) | Sí |

**Pitch:** el celular no entra en la factura Noova; se paga Noova por IA, equipo en plataforma y plantillas gestionadas.

---

## IA vs humano: configuración escalable (sin custom por cliente)

**No** activar IA en todo por defecto al conectar coexistencia (hoy el código usa `handoffMode: "ai"` en entrantes — válido para solo-API, **no** para línea legacy).

### Settings a nivel **canal** (self-serve)

| Setting | Opciones |
|---------|----------|
| Modo por defecto chats nuevos | `humano` / `ia` / `solo_referral_campana` |
| Pausar IA si escriben desde celular | On (default) |
| Agente de texto | Ya existe |
| Horario IA | Opcional |

**Default recomendado al conectar coexistencia:** `humano` o `ia_solo_nuevos`.

`ia_solo_nuevos` = IA solo si el **primer entrante** del hilo es **después de `connected_at`** del canal. Hilos “viejos” (solo celular) no los toca la IA aunque escriban de nuevo.

### A nivel **conversación** (inbox)

- Toggle IA / Humano (`handoff_mode` ya existe).

### Reglas automáticas (mismo código para todos)

1. `smb_message_echoes` → `handoff_mode: human` en ese hilo.
2. `referral.ad` en webhook → IA (campaña).
3. CRM VIP → humano.
4. Opt-out → bloqueado.

---

## Cómo venderlo (línea 20 años en celular)

**Mensaje:** no cambiamos número ni quitamos el celular; conectamos Noova encima (IA + inbox + CRM). Lo nuevo se ve en ambos lados; historial viejo **no** se migra.

**No decir:** migración total, solo API, dejen el celular.

**Objeciones:**

- ¿Me cobran WhatsApp? → Celular no por API; Meta cobra plantillas; Noova cobra IA/plataforma.
- ¿Pierdo el celular? → No, coexistencia.
- ¿La IA me tapa? → Celular pausa IA; o humano en inbox.

---

## Cuando retomemos implementación (checklist)

1. Modal: `featureType: "whatsapp_business_app_onboarding"` (+ config Meta separada si hace falta).
2. Webhook route: `smb_message_echoes` → persistir `role: human`, handoff humano, dedup con envíos API.
3. Canal: `default_handoff_mode`, `coexistence_enabled`, `connected_at`.
4. Inbound: respetar default; modo `ai_solo_nuevos`.
5. Billing: no `recordUsage` en ecos de celular; solo IA/inbox/plantilla API.
6. UI Canales: copy comercial (celular vs Noova vs plantillas).
7. Opcional: parsear `referral` para campañas CTWA.

---

## Referencias Meta

- [Coexistence / onboarding app users](https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/)
- [Pricing](https://developers.facebook.com/docs/whatsapp/pricing/)
- [Service messages / CSW](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
