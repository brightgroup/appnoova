# Plan de rollback y backups — Noova 360

Guía rápida cuando algo falla en producción o necesitas recuperar datos.

---

## 1. Rollback de código (3 pasos)

### Paso 1 — Identifica el último commit bueno

Abre: https://github.com/brightgroup/appnoova/commits/main

Ejemplo: `886ca76` (antes de contextos de marca).

### Paso 2 — Vuelve a esa versión en tu Mac

```bash
cd /Users/johngarcia/appnoova

# Opción A (recomendada): revertir el commit malo sin borrar historial
git revert 02e029b
git push origin main

# Opción B: probar localmente un commit antiguo
git checkout 886ca76
npm run build
npm run start -- -p 8000
```

### Paso 3 — Reconstruye y reinicia el servidor

```bash
npm run build
lsof -ti:8000 | xargs kill -9 2>/dev/null
npm run start -- -p 8000
```

Hard refresh en el navegador: **Cmd + Shift + R**.

> **Nota:** `.env.local` no está en Git. Si cambiaste keys, conserva una copia segura aparte.

---

## 2. Backup de Supabase (automático, GitHub Actions)

**Plan actual: Supabase Free — no incluye backups automáticos** (eso es desde Pro).
El workflow `.github/workflows/backup-db-drive.yml` es la única red de seguridad real:

- Corre **todos los días a las 08:30 UTC (~03:30 Colombia)** en GitHub Actions —
  no depende de que tu Mac ni ninguna máquina esté encendida.
- Hace `pg_dump` del schema `public` y lo sube a **Google Drive**, carpeta
  `appnoova-backups/` (retiene 30 días, borra los más viejos).
- También copia los buckets de Storage (`whatsapp-media`,
  `voice-call-recordings`) a `appnoova-backups/storage/` en Drive — estos
  **no se borran nunca automáticamente** (crecen con el tiempo, revisa tu
  cuota de Drive de vez en cuando).
- Se puede disparar manualmente: GitHub → Actions → "Backup DB to Drive" →
  **Run workflow** (útil antes de una migración grande).

Secrets usados (GitHub → Settings → Secrets and variables → Actions):
`SUPABASE_DB_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `RCLONE_CONF_B64`,
`SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`.

### Backup manual desde tu Mac (opcional, complementario)

```bash
npm run backup:db
```

- Guarda en `backups/supabase-[proyecto]-[fecha].sql`
- Requiere `SUPABASE_DB_PASSWORD` en `.env.local`
- **No se sube a GitHub** (contiene datos de clientes)

### Restaurar la base de datos

```bash
npm run restore:db -- --from-drive          # el más reciente de Drive
npm run restore:db -- --date 2026-07-08     # uno de una fecha específica
npm run restore:db -- backups/supabase-xxx.sql   # un archivo local
```

El script (`scripts/restore-supabase.mjs`):
1. Descarga el backup elegido (si viene de Drive) y muestra fecha/tamaño.
2. Pide escribir `RESTAURAR` explícitamente antes de tocar nada.
3. Hace un backup de último momento del estado actual (por si acaso).
4. Borra y recrea el schema `public`, aplica el dump, y reaplica los grants
   estándar de Supabase para `anon`/`authenticated`/`service_role` (el dump
   se genera con `--no-acl`, así que esos permisos no vienen incluidos).

⚠️ Es destructivo: reemplaza todo lo que haya en `public` en ese momento.

### Restaurar Storage (archivos e imágenes/audios)

```bash
npm run restore:storage -- whatsapp-media
npm run restore:storage -- voice-call-recordings
npm run restore:storage -- all
```

Requiere `SUPABASE_S3_ACCESS_KEY_ID` / `SUPABASE_S3_SECRET_ACCESS_KEY` en
`.env.local` (Supabase → Settings → Storage → S3 Connection). También pide
confirmación explícita — deja el bucket idéntico al respaldo en Drive.

---

## 3. Qué restaura cada cosa

| Problema | Solución |
|---|---|
| Bug en el código | `git revert` o checkout + rebuild |
| Migración SQL mala | Restaurar backup `.sql` de `backups/` |
| Keys / `.env.local` perdidas | Recuperar de gestor de contraseñas o Supabase/Google AI Studio |
| Usuarios auth borrados | Supabase Dashboard → Authentication (no incluido en dump public) |

---

## 4. Checklist antes de cambios grandes

- [ ] `npm run backup:db`
- [ ] Commit en Git con mensaje claro
- [ ] Probar en local (`npm run build && npm run start -p 8000`)
- [ ] Si hay SQL nuevo: aplicar migración y verificar con la app

---

## 5. Flujo con ramas (próximo paso recomendado)

```
main                    ← producción estable
  └── feature/mi-cambio ← desarrollo
        └── PR → merge a main
```

Proteger `main` en GitHub: **Settings → Branches → Add rule → Require pull request**.
