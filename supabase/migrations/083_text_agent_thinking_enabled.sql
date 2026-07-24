-- Modo "razonamiento cuidadoso" (thinking de Gemini) configurable por agente.
-- Se desactivó globalmente (thinkingBudget: 0) porque se comía el
-- presupuesto de tokens de salida en respuestas cortas de WhatsApp sin
-- aportar nada en tareas conversacionales simples. Pero para agentes que
-- deben leer con cuidado una tabla de datos grande (catálogos, precios) y
-- no confundir filas parecidas, sí ayuda — se deja apagado por defecto para
-- no afectar a ningún agente existente, y se activa solo caso por caso.

alter table public.text_agents
  add column if not exists thinking_enabled boolean not null default false;
