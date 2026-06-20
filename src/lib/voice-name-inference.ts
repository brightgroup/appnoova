import { GEMINI_VOICES } from "@/lib/voice-agent-options";

export type InferredVoiceGender = "male" | "female" | "neutral";

const MALE_FIRST_NAMES = new Set([
  "juan", "carlos", "pedro", "jose", "josé", "luis", "miguel", "andres", "andrés",
  "diego", "david", "daniel", "alejandro", "fernando", "ricardo", "sergio", "pablo",
  "jorge", "oscar", "óscar", "manuel", "roberto", "eduardo", "felipe", "camilo",
  "sebastian", "sebastián", "matias", "matías", "nicolas", "nicolás", "santiago",
  "martin", "martín", "gabriel", "hugo", "ivan", "iván", "marcos", "antonio",
  "francisco", "alberto", "rafael", "emilio", "valentino", "mariano", "julian", "julián",
  "leonardo", "mateo", "samuel", "christian", "cristian", "esteban", "federico",
  "gonzalo", "guillermo", "hector", "héctor", "jaime", "lucas", "marcelo", "mario",
  "mauricio", "nelson", "omar", "patricio", "ramon", "ramón", "renato", "rodrigo",
  "tomas", "tomás", "vicente", "wilson", "yerson", "brayan", "stiven", "yeison",
]);

const FEMALE_FIRST_NAMES = new Set([
  "maria", "maría", "ana", "laura", "valentina", "sofia", "sofía", "camila", "paula",
  "andrea", "diana", "carolina", "natalia", "juliana", "daniela", "alejandra", "gabriela",
  "isabella", "fernanda", "adriana", "patricia", "claudia", "sandra", "monica", "mónica",
  "lucia", "lucía", "elena", "beatriz", "rocio", "rocío", "mariana", "catalina",
  "veronica", "verónica", "angela", "ángela", "lorena", "silvia", "teresa", "gloria",
  "paola", "lina", "karen", "yolanda", "marcela", "liliana", "johana", "estefania",
  "estefanía", "valeria", "nicole", "melissa", "jessica", "michelle", "sara", "emma",
  "mia", "elisa", "rosa", "alicia", "jimena", "ximena", "antonia", "constanza",
]);

const DEFAULT_VOICES: Record<InferredVoiceGender, string> = {
  male: "Charon",
  female: "Kore",
  neutral: "Kore",
};

/** Infiere género de voz a partir del nombre del agente (heurística español). */
export function inferVoiceGenderFromName(name: string): InferredVoiceGender {
  const parts = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "neutral";

  let maleScore = 0;
  let femaleScore = 0;

  parts.forEach((part, index) => {
    const weight = index === 0 ? 2 : 1;
    if (MALE_FIRST_NAMES.has(part)) maleScore += 2 * weight;
    if (FEMALE_FIRST_NAMES.has(part)) femaleScore += 2 * weight;

    if (part.length >= 4) {
      if (part.endsWith("o")) maleScore += weight;
      else if (part.endsWith("a")) femaleScore += weight;
    }
  });

  if (maleScore > femaleScore) return "male";
  if (femaleScore > maleScore) return "female";
  return "neutral";
}

/** Sugiere ID de voz Gemini acorde al nombre del agente. */
export function suggestVoiceForAgentName(name: string): string {
  const gender = inferVoiceGenderFromName(name);
  return DEFAULT_VOICES[gender];
}

export function voiceLabel(voiceId: string): string {
  return GEMINI_VOICES.find(v => v.id === voiceId)?.label ?? voiceId;
}

export function voiceGenderHint(name: string): string {
  const gender = inferVoiceGenderFromName(name);
  if (gender === "male") return "Detectamos un nombre masculino — voz masculina sugerida.";
  if (gender === "female") return "Detectamos un nombre femenino — voz femenina sugerida.";
  return "Nombre neutro — puedes elegir la voz que prefieras.";
}
