/** Acciones Call Control de Telnyx para atender llamadas entrantes. */
export async function telnyxCallAction(
  callControlId: string,
  action: string,
  json?: Record<string, unknown>
): Promise<void> {
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) throw new Error("TELNYX_API_KEY no configurado");

  const res = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: json ? JSON.stringify(json) : undefined
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errs = data.errors as { detail?: string }[] | undefined;
    throw new Error(errs?.[0]?.detail || `Telnyx ${action} falló (${res.status})`);
  }
}

export async function answerAndSpeak(
  callControlId: string,
  text: string
): Promise<void> {
  await telnyxCallAction(callControlId, "answer");
  await telnyxCallAction(callControlId, "speak", {
    payload: text,
    voice: "female",
    language: "es-CO"
  });
}

export async function speakText(callControlId: string, text: string): Promise<void> {
  await telnyxCallAction(callControlId, "speak", {
    payload: text,
    voice: "female",
    language: "es-CO"
  });
}

export async function telnyxPlaceCall(params: {
  connectionId: string;
  from: string;
  to: string;
}): Promise<{ callControlId: string }> {
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) throw new Error("TELNYX_API_KEY no configurado");

  const res = await fetch("https://api.telnyx.com/v2/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      connection_id: params.connectionId,
      from: params.from,
      to: params.to
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errs = data.errors as { detail?: string }[] | undefined;
    throw new Error(errs?.[0]?.detail || `Telnyx dial falló (${res.status})`);
  }

  const callControlId = data.data?.call_control_id as string | undefined;
  if (!callControlId) throw new Error("Telnyx no devolvió call_control_id");
  return { callControlId };
}
