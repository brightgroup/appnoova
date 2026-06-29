import re
import unicodedata

# Patrones de cierre del AGENTE (no del usuario).
# El colgado solo debe ocurrir tras la despedida natural del agente, p. ej.
# "Listo don Juan, que esté muy bien" — no cuando el usuario dice "no tengo tiempo".
AGENT_GOODBYE_PATTERNS = [
    # ── Despedida directa del agente ─────────────────────────────────────────
    re.compile(r"\bhasta luego\b", re.I),
    re.compile(r"\bhasta pronto\b", re.I),
    re.compile(r"\bhasta la pr[oó]xima\b", re.I),
    re.compile(r"\bhasta ma[nñ]ana\b", re.I),
    re.compile(r"\bhasta (m[aá]s )?tarde\b", re.I),
    re.compile(r"\bnos vemos\b", re.I),
    re.compile(r"\bme despido\b", re.I),
    re.compile(r"\bha sido un placer\b", re.I),
    re.compile(r"\bfue un gusto\b", re.I),

    # ── "Que tenga/tengas/esté un buen/feliz día" (tú y usted) ───────────────
    re.compile(
        r"\bque (le |te )?ten[ga]a?s?\b.{0,12}\b(buen|excelente|lindo|hermoso|bonito|feliz|magnifico|estupendo)\b.{0,12}\b(d[ií]a|tarde|noche)\b",
        re.I,
    ),
    re.compile(r"\bque est[eé] muy bien\b", re.I),
    re.compile(r"\bque le vaya (muy )?bien\b", re.I),
    re.compile(r"\bque (te|le) vaya bien\b", re.I),
    re.compile(r"\bque est[eé][sn]? bien\b", re.I),
    re.compile(r"\bfeliz d[ií]a\b", re.I),

    # ── Cierre con "listo" / "perfecto" + despedida ──────────────────────────
    re.compile(
        r"\blisto\b.{0,60}\b(que (le |te )?(este|tenga|vaya)|muy bien|gracias|buen|feliz|pendiente)\b",
        re.I,
    ),
    re.compile(
        r"\bperfecto\b.{0,60}\b(gracias|que (le |te )?(tenga|este|vaya)|muy bien|buen|feliz)\b",
        re.I,
    ),
    re.compile(
        r"\b(entendido|comprendo)\b.{0,50}\b(que (le |te )?(tenga|este|vaya)|gracias|muy bien|buen|feliz)\b",
        re.I,
    ),

    # ── Cortesía de cierre ───────────────────────────────────────────────────
    re.compile(r"\bmuchas gracias (por su tiempo|por (llamar|atendernos|atenderme))\b", re.I),
    re.compile(
        r"\bgracias por (llamar|contactarnos|contactar|comunicarte|su llamada|llamarnos|su tiempo|atendernos)\b",
        re.I,
    ),
    re.compile(r"\bquedo (muy )?pendiente\b", re.I),
    re.compile(r"\bquedamos (as[ií]|en contacto|pendientes)\b", re.I),
    re.compile(r"\bcualquier cosa\b.{0,30}\b(colaboro|gusto|servirle)\b", re.I),
    re.compile(r"\ba la orden\b", re.I),
    re.compile(r"\bcon mucho gusto le colaboro\b", re.I),
]

# Frases de mitad de conversación que NO deben colgar.
AGENT_FALSE_POSITIVE = re.compile(
    r"^(listo|perfecto|claro|entiendo|de acuerdo|muy bien)[,.\s]+(le |te )?(cuento|explico|comento|informo|confirmo|repito|digo)",
    re.I,
)


def _normalize(text: str) -> str:
    return (
        unicodedata.normalize("NFD", text)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        .strip()
    )


def is_agent_goodbye_utterance(text: str) -> bool:
    normalized = _normalize(text)
    if len(normalized) < 8:
        return False
    if AGENT_FALSE_POSITIVE.search(normalized):
        return False
    return any(p.search(normalized) for p in AGENT_GOODBYE_PATTERNS)


# Alias para compatibilidad con imports existentes.
def is_goodbye_utterance(text: str) -> bool:
    return is_agent_goodbye_utterance(text)
