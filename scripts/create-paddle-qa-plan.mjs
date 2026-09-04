/**
 * Crea producto+precio Paddle "QA $1" (Live y sandbox si hay keys) e imprime los pri_*.
 * Uso: node scripts/create-paddle-qa-plan.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = { ...process.env };
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    if (env[k] == null || env[k] === "") env[k] = t.slice(i + 1).trim();
  }
  return env;
}

async function paddleFetch(base, key, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${json?.error?.detail || JSON.stringify(json.error || json)}`);
  }
  return json.data;
}

async function createQaPrice(label, base, key) {
  const product = await paddleFetch(base, key, "/products", {
    name: "Noova QA $1 (interno)",
    tax_category: "standard",
    description: "Checkout de prueba interno. No vender. No listar en marketing.",
  });
  const price = await paddleFetch(base, key, "/prices", {
    description: "QA interno USD 1 / mes",
    product_id: product.id,
    unit_price: { amount: "100", currency_code: "USD" },
    billing_cycle: { interval: "month", frequency: 1 },
    quantity: { minimum: 1, maximum: 1 },
  });
  console.log(`${label} product=${product.id} price=${price.id}`);
  return price.id;
}

const env = loadEnv();
const liveKey = env.PADDLE_API_KEY_LIVE || (env.PADDLE_ENV === "live" ? env.PADDLE_API_KEY : "");
const sandboxKey = env.PADDLE_API_KEY?.startsWith("pdl_sdbx") ? env.PADDLE_API_KEY : env.PADDLE_API_KEY_SANDBOX;

if (liveKey) {
  await createQaPrice("live", "https://api.paddle.com", liveKey);
} else {
  console.log("skip live: no PADDLE_API_KEY_LIVE");
}

if (sandboxKey) {
  await createQaPrice("sandbox", "https://sandbox-api.paddle.com", sandboxKey);
} else {
  console.log("skip sandbox: no sandbox API key");
}
