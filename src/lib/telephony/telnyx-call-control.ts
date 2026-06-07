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
