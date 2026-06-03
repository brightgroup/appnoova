# 🏗️ Arquitectura de Autenticación - Diagrama

## Flujo General

```
┌─────────────────────────────────────────────────────────────────┐
│                         NOOVA 360                               │
│                                                                 │
│  Página Pública (/)                                            │
│  └─> Login (/login)                                            │
│      └─> Signup (/signup)                                      │
│          └─> Auth con Supabase                                 │
│              └─> Dashboard (/dashboard) [Protegido]            │
│              └─> Admin (/admin) [Protegido]                    │
│                  └─> Admin Users (/admin/users)                │
│                  └─> Admin Clients (/admin/clients)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Capas de la Aplicación

```
┌──────────────────────────┐
│   UI Components          │
│  (Login, Signup, Dash)   │
└────────┬─────────────────┘
         │
┌────────▼──────────────────────┐
│   Next.js Middleware           │
│   (Route Protection)           │
│   middleware.ts                │
└────────┬──────────────────────┘
         │
┌────────▼──────────────────────┐
│   Supabase Auth                │
│   signInWithPassword()         │
│   signUp()                     │
│   signOut()                    │
│   getSession()                 │
└────────┬──────────────────────┘
         │
┌────────▼──────────────────────┐
│   Supabase Database            │
│   - auth.users (Auth)          │
│   - users (Profile)            │
│   - clients, companies, etc    │
└────────────────────────────────┘
```

---

## Flujo de Autenticación

### 1. SIGNUP
```
User Form (Nombre, Email, Password)
    ↓
handleSubmit()
    ↓
supabase.auth.signUp({ email, password })
    ↓
✅ Crea en auth.users
    ↓
INSERT INTO users (id, email, nombre, rol)
    ↓
✅ Auto redirect a /dashboard
```

### 2. LOGIN
```
User Form (Email, Password)
    ↓
handleSubmit()
    ↓
supabase.auth.signInWithPassword({ email, password })
    ↓
✅ Retorna Session
    ↓
useAuth() hook → obtiene usuario
    ↓
✅ Auto redirect a /dashboard
```

### 3. LOGOUT
```
Click "Cerrar sesión"
    ↓
logout() de useAuth
    ↓
supabase.auth.signOut()
    ↓
✅ Limpia session
    ↓
router.push("/login")
```

### 4. ROUTE PROTECTION
```
GET /dashboard
    ↓
middleware.ts
    ↓
supabase.auth.getSession()
    ↓
¿Session válida?
├─ YES → Permite acceso
└─ NO  → Redirige a /login
```

---

## Estructura de Archivos Nuevos

```
src/
├── app/
│   ├── login/
│   │   └── page.tsx          ← Actualizado: Supabase Auth
│   ├── signup/
│   │   └── page.tsx          ← Nuevo: Formulario de registro
│   ├── dashboard/
│   │   └── page.tsx          ← Actualizado: useAuth() hook
│   ├── admin/
│   │   ├── page.tsx          ← Actualizado: Logout button
│   │   └── users/
│   │       └── page.tsx      ← Nuevo: CRUD de usuarios
│   └── ...
├── hooks/
│   └── useAuth.ts            ← Nuevo: Auth hook
├── lib/
│   └── supabase.ts           ← Supabase client
└── types/
    └── index.ts              ← TypeScript types

middleware.ts                 ← Nuevo: Route protection
```

---

## Database Schema (Supabase)

```sql
-- Auth Users (Managed by Supabase)
auth.users
├─ id: UUID
├─ email: VARCHAR
├─ created_at: TIMESTAMP
└─ last_sign_in_at: TIMESTAMP

-- User Profiles
users (table)
├─ id: UUID (foreign key → auth.users)
├─ email: VARCHAR
├─ nombre: VARCHAR
├─ rol: ENUM ['admin', 'agent', 'viewer']
├─ created_at: TIMESTAMP
└─ updated_at: TIMESTAMP

-- Clientes (de pasos anteriores)
clients
├─ id: UUID
├─ nombre: VARCHAR
├─ empresa: VARCHAR
└─ ...
```

---

## Estados y Contexto

### useAuth() Hook
```typescript
{
  user: User | null,           // Usuario autenticado
  loading: boolean,            // Cargando sesión
  logout: () => Promise<void>  // Función para logout
}
```

### Listener de Sesión
```
supabase.auth.onAuthStateChange()
├─ 'SIGNED_IN'  → setUser(usuario)
├─ 'SIGNED_OUT' → setUser(null)
└─ 'USER_UPDATED' → actualiza usuario
```

---

## Security Features

✅ **JWT Tokens**: Supabase maneja JWT automáticamente  
✅ **Row Level Security**: RLS en Supabase (ya configurada)  
✅ **Middleware Protection**: Next.js middleware protege rutas  
✅ **Password Hashing**: Supabase hasea contraseñas  
✅ **Session Management**: useAuth() listener en tiempo real  

---

## Próximas Fases

### Fase 2: Templates Management
- Panel para editar prompts de agentes
- Configurar tonalidad, temperatura, speed, voices

### Fase 3: Llamadas en Vivo
- Integración con Gemini Flash API
- UI de llamada en progreso
- Grabación y transcripción

### Fase 4: Analytics
- Historial de llamadas
- Reportes y métricas
- Dashboard de performance

---

¡Arquitectura lista! 🚀
