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

## 2. Backup de Supabase (desde ya)

### Automático en tu Mac (recomendado)

```bash
npm run backup:db
```

- Guarda en `backups/supabase-[proyecto]-[fecha].sql`
- Requiere `SUPABASE_DB_PASSWORD` en `.env.local`
- **No se sube a GitHub** (contiene datos de clientes)

**Frecuencia sugerida:** antes de cada migración SQL y al menos 1 vez por semana.

### Manual desde Supabase Dashboard

1. [Dashboard → tu proyecto](https://supabase.com/dashboard/project/fsdvvxdbbcxbtgjmwkkq)
2. **Database → Backups** (backups diarios automáticos en plan Pro)
3. **Database → Migrations / SQL Editor** — para cambios puntuales

### Restaurar un backup SQL

```bash
# Solo schema public (agentes, contextos, etc.)
/opt/homebrew/opt/libpq/bin/psql "postgresql://postgres.[REF]:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
  -f backups/supabase-XXXX.sql
```

⚠️ Restaurar **sobrescribe** tablas existentes. Haz backup nuevo antes de restaurar.

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
