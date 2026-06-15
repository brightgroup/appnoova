# NOOVA360 — Usuarios, roles y multitenant

Estado: **Fase 1 (Supabase)** implementada en migraciones `033` y `034`.

## Objetivo

Separar dos planos de identidad:

| Plano | Quién | Dónde se administra |
|-------|--------|---------------------|
| **Plataforma** | Superadministradores Noova | `/admin` |
| **Organización** | Propietarios, admins, gerentes, asesores | `/dashboard` (fase 2) |

Hoy cada cuenta legacy (`auth.users.id` = `user_id` en tablas) se convierte en **una organización** con el usuario como **owner**. La app sigue usando `user_id` hasta la fase 3 (añadir `organization_id` a tablas de dominio).

## Dos tipos de roles (modelo claro)

### 1. Superadministrador (fijo, no configurable)
- **Usuario:** `admin@noova360.com`
- **Acceso:** único con entrada a `/admin`
- **Permisos:** todo en la plataforma
- **Protección:** `is_protected = true` — no se puede suspender, desactivar ni quitar permisos
- **Rol SQL:** `super_admin` (plataforma)

### 2. Roles de organización (configurables en `/admin/roles`)
- Aplican a usuarios **dentro de una empresa** en el **dashboard** (`/dashboard`)
- **No tienen acceso a `/admin`**
- Se configuran con matriz módulo × nivel (`Ninguno` / `Ver` / `Editar` / `Administrar`)
- Plantillas por defecto:
  - **Administrador de organización** (`org_admin`) — empresa suscriptora, manage en todo el dashboard
  - **Gerente**, **Asesor**, **Solo lectura**
- Al guardar una plantilla, los cambios se propagan a todas las organizaciones
- Se pueden crear roles custom adicionales

### Quién va dónde

| Usuario | Panel | Rol |
|---------|-------|-----|
| admin@noova360.com | `/admin` | Superadmin (protegido) |
| Dueño de empresa | `/dashboard` | owner (por org) |
| Admin de empresa | `/dashboard` | org_admin (configurable) |
| Asesor | `/dashboard` | advisor (configurable) |


```
auth.users
    └── profiles (email, full_name, is_platform_admin, status)
    └── platform_role_assignments → roles (scope=platform)
    └── organization_members → roles (scope=organization) → role_permissions
              └── organizations
    └── user_active_organization (org activa en sesión)
```

### Tablas nuevas

- **organizations** — cuenta/tenant (nombre, slug, owner, plan, status).
- **profiles** — perfil canónico; complementa `public.users` legacy.
- **permission_modules** — catálogo de módulos (voice_agents, inbox, crm, …).
- **roles** — roles de plataforma (`organization_id` NULL) o de org (custom + sistema).
- **role_permissions** — matriz módulo × nivel (`none` | `view` | `edit` | `manage`).
- **organization_members** — usuario ↔ org ↔ rol.
- **platform_role_assignments** — staff Noova con rol de plataforma.
- **user_active_organization** — org seleccionada en sesión.
- **organization_invites** — invitaciones pendientes (fase 2).

### Niveles de permiso

| Nivel | Significado |
|-------|-------------|
| `none` | Sin acceso |
| `view` | Solo lectura |
| `edit` | Crear/editar en el módulo |
| `manage` | Control total del módulo (config, eliminar, asignar) |

### Roles de sistema (organización)

| Slug | Uso típico |
|------|------------|
| `owner` | Dueño de la cuenta; manage en todo |
| `org_admin` | Administra usuarios, canales, CRM |
| `manager` | Opera inbox, CRM y agentes |
| `advisor` | Asesor: inbox + CRM (conversaciones) |
| `viewer` | Solo lectura |

Roles custom por org: mismo modelo que el modal de referencia (nombre, descripción, permisos por módulo).

### Roles de plataforma

| Slug | Uso |
|------|-----|
| `super_admin` | Acceso total `/admin` |
| `platform_support` | Ver usuarios y orgs; acciones limitadas |

Compatibilidad: `users.rol = 'admin'` o `profiles.is_platform_admin = true` → superadmin.

## Módulos de permiso (organización)

Alineados con la UI de referencia:

- Agentes de voz, Agentes de texto, Inbox, CRM, Campañas, Flow Studio
- Canales, WhatsApp, Telefonía, Facturación, Contextos de marca, Usuarios org

## Admin `/admin` (fases)

### Fase 1 ✅ Supabase
- Migraciones 033–034, backfill, RLS básico, helpers SQL.

### Fase 2 (siguiente)
- `/admin/users` — listar, crear, activar/desactivar usuarios plataforma.
- `/admin/organizations` — CRUD orgs, suspender cuenta.
- `/admin/roles` — roles plataforma + modal permisos por módulo.
- APIs con service role + `requirePlatformAdmin()`.

### Fase 2b ✅ Equipo (dashboard)
- `/dashboard/equipo` — miembros de la org, invitaciones, cambio de rol.
- APIs `/api/org/members`, `/api/org/roles`, `/api/org/me`.
- Permiso requerido: módulo `org_users` (view / edit / manage).
- Invitaciones se aceptan automáticamente al registrarse (migración 036).

### Fase 3
- `/dashboard/equipo` — miembros de la org, invitaciones, roles.
- `organization_id` en tablas tenant; RLS por membresía.
- Inbox: `assigned_to_user_id` (UUID) en lugar de texto.

## Funciones SQL útiles

- `is_platform_admin(user_id)` — gate del panel admin.
- `user_org_permission_level(user_id, org_id, module_key)` — nivel efectivo.
- `seed_organization_system_roles(org_id)` — crea roles owner/admin/manager/advisor/viewer.
- `permission_level_rank(level)` — orden para comparar niveles.

## Tipos TypeScript

Ver `src/types/rbac.ts`.
