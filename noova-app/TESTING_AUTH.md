# 🧪 Testing Plan - Autenticación y Gestión de Usuarios

## 1️⃣ Preparación

### Limpiar y Reiniciar
```bash
cd /Users/johngarcia/appnoova/noova-app

# Detener servidor existente
pkill -f "next dev"

# Limpiar caché
rm -rf .next node_modules/.cache

# Reiniciar servidor
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Esperar a ver:
```
✓ Ready in XXXms
```

---

## 2️⃣ Test Flow

### Test 1: Signup (Registro)
1. Navegar a: `http://localhost:3000/signup`
2. Completar formulario:
   - Nombre: `Juan García`
   - Email: `test@example.com`
   - Contraseña: `password123`
   - Confirmar: `password123`
3. Click "Crear Cuenta"
4. ✅ Debería redirigir a `/dashboard`

### Test 2: Logout desde Dashboard
1. Estando en `/dashboard`
2. Click botón Logout (abajo en sidebar)
3. ✅ Debería ir a `/login`

### Test 3: Login
1. Navegar a: `http://localhost:3000/login`
2. Ingresar credenciales del Test 1:
   - Email: `test@example.com`
   - Contraseña: `password123`
3. Click "Ingresar"
4. ✅ Debería ir a `/dashboard`

### Test 4: Ruta Protegida
1. Hacer logout
2. Intentar acceder directamente a: `http://localhost:3000/dashboard`
3. ✅ Debería redirigir a `/login`

### Test 5: Admin Panel
1. Login con usuario (test@example.com)
2. Navegar a: `http://localhost:3000/admin`
3. ✅ Debería mostrar admin panel
4. Click en "Gestionar Usuarios"
5. ✅ Debería ir a `/admin/users`

### Test 6: CRUD de Usuarios
En `/admin/users`:

**Crear Usuario:**
1. Click "Nuevo Usuario"
2. Rellenar:
   - Nombre: `Otro Agente`
   - Email: `agent@example.com`
   - Rol: `agent`
3. Click "Crear"
4. ✅ Debería aparecer en la tabla

**Editar Usuario:**
1. Click icono edit en un usuario
2. Cambiar nombre o rol
3. Click "Actualizar"
4. ✅ Los cambios se guardan

**Eliminar Usuario:**
1. Click icono trash
2. Confirmar
3. ✅ Usuario desaparece

---

## 3️⃣ Verificar en Supabase

### Tabla `auth.users`
1. Login a: https://supabase.com
2. Project: `fsdvvxdbbcxbtgjmwkkq`
3. SQL Editor → Ejecutar:
   ```sql
   SELECT id, email, created_at FROM auth.users LIMIT 5;
   ```
4. ✅ Debería ver usuarios creados

### Tabla `users`
1. En SQL Editor:
   ```sql
   SELECT id, email, nombre, rol FROM users ORDER BY created_at DESC LIMIT 5;
   ```
2. ✅ Debería tener registro de usuarios

---

## 4️⃣ Endpoints de la API

Si todo funciona, estos endpoints ya están listos (del paso anterior):

- `GET /api/clients` - Listar clientes
- `POST /api/clients` - Crear cliente
- `GET /api/clients/[id]` - Obtener cliente
- `PUT /api/clients/[id]` - Actualizar cliente
- `DELETE /api/clients/[id]` - Eliminar cliente

---

## 🐛 Troubleshooting

### Error: "Module not found: @supabase/auth-helpers-nextjs"
```bash
npm install @supabase/auth-helpers-nextjs
```

### Error: "DEMO_EMAIL is not defined"
- Limpiar `.next` y reiniciar servidor
- Este error indica que el caché viejo está siendo servido

### Error: "EADDRINUSE: address already in use"
- Puerto 3000 ya está en uso
- Usar puerto diferente: `npm run dev -- --port 3001`
- O matar proceso: `lsof -ti:3000 | xargs kill -9`

### Middleware no protege rutas
- Verificar que `middleware.ts` existe en root del proyecto
- Verificar que el `matcher` incluye las rutas a proteger

---

## ✅ Checklist Final

- [ ] Signup funciona y crea usuario en Supabase
- [ ] Login funciona con credenciales creadas
- [ ] Logout funciona desde dashboard y admin
- [ ] Rutas `/dashboard` y `/admin` redirigen a `/login` si no logueado
- [ ] Admin panel de usuarios tiene CRUD completo
- [ ] Usuarios se guardan en table `users` de Supabase

---

¡Listo para testear! 🚀
