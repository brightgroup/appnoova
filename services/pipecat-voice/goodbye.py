import re
import unicodedata

GOODBYE_PATTERNS = [
    re.compile(r"\badi[oó]s\b", re.I),
    re.compile(r"\bhasta luego\b", re.I),
    re.compile(r"\bhasta pronto\b", re.I),
    re.compile(r"\bhasta la pr[oó]xima\b", re.I),
    re.compile(r"\bnos vemos\b", re.I),
    re.compile(r"\b(chao|chau)\b", re.I),
    re.compile(r"\bfue un gusto\b", re.I),
    re.compile(
        r"\bgracias por (llamar|contactarnos|contactar|comunicarte|su llamada|llamarnos)\b",
        re.I,
    ),
    re.compile(
        r"\bque tengas (un )?(buen|excelente|lindo|hermoso) (d[ií]a|tarde|noche)\b",
        re.I,
    ),
    re.compile(r"\bque le vaya bien\b", re.I),
    re.compile(r"\bque est[eé]s bien\b", re.I),
    re.compile(r"\bme despido\b", re.I),
    re.compile(r"\bterminamos (la )?llamada\b", re.I),
    re.compile(r"\b(cierro|cerramos) (la )?llamada\b", re.I),
    re.compile(r"\bbye\b", re.I),
    re.compile(r"\bgood\s?bye\b", re.I),
    re.compile(r"\bhasta (m[aá]s )?tarde\b", re.I),
    re.compile(r"\beso es todo\b", re.I),
    re.compile(r"\bquedamos (as[ií]|en contacto)\b", re.I),
]

GREETING_ONLY = re.compile(
    r"^(hola|buenos d[ií]as|buenas tardes|buenas noches|bienvenido)[!.?\s]*$",
    re.I,
)


def is_goodbye_utterance(text: str) -> bool:
    normalized = (
        unicodedata.normalize("NFD", text)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        .strip()
    )
    if len(normalized) < 5:
        return False
    if GREETING_ONLY.match(normalized):
        return False
    return any(p.search(normalized) for p in GOODBYE_PATTERNS)
