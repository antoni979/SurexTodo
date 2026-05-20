# SurexTodo

Aplicación web (PWA instalable en Windows) de gestión de tareas personales y
de equipo, al estilo de Microsoft To Do.

- **Frontend:** React + Vite + TypeScript
- **Backend:** [Convex](https://convex.dev) (base de datos + autenticación + tiempo real)
- **Auth:** email + contraseña

## Funcionalidades

- Cuentas de usuario; cada uno elige su **nombre de usuario** la primera vez.
- Tareas personales con **prioridad** (Baja / Media / Alta / Súper urgente) y
  fecha de vencimiento.
- **Mi día:** las tareas que planeas para hoy.
- **Planeado:** tus tareas con vencimiento agrupadas en Vencidas / Hoy /
  Mañana / Próximamente.
- **Equipos:** creas equipos y añades miembros por su nombre de usuario.
- Tareas de equipo que se pueden **asignar** a un miembro. Si una tarea de
  equipo tiene vencimiento, solo aparece en "Planeado" de la persona asignada.

---

## Puesta en marcha (primera vez)

Necesitas [Node.js](https://nodejs.org) 18 o superior.

### 1. Instalar dependencias

```bash
npm install
```

(Si npm se queja de dependencias, usa `npm install --legacy-peer-deps`.)

### 2. Crear el proyecto en Convex

```bash
npx convex dev
```

La primera vez te pedirá iniciar sesión en Convex (se abre el navegador) y
crear un proyecto nuevo — llámalo `surextodo`. **Deja este comando corriendo**
en su propia terminal: genera la carpeta `convex/_generated`, sincroniza el
backend y observa cambios.

### 3. Configurar las claves de autenticación

En **otra terminal** (con el comando anterior aún corriendo):

```bash
npx @convex-dev/auth
```

Esto genera las claves JWT que Convex Auth necesita y las guarda como
variables de entorno en tu deployment.

> Si te pregunta si quiere **sobrescribir** archivos existentes
> (`auth.ts`, `http.ts`, `auth.config.ts`), responde **No** — esos archivos ya
> están listos en el proyecto. Solo necesitamos que configure las claves
> (`JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`).

### 4. Comprobar la variable del frontend

`npx convex dev` crea/actualiza el archivo `.env.local`. Asegúrate de que
contiene una línea como esta (Vite la necesita):

```
VITE_CONVEX_URL=https://tu-deployment.convex.cloud
```

Si solo aparece `CONVEX_URL=...`, añade tú la línea `VITE_CONVEX_URL=` con la
misma URL.

### 5. Arrancar la app

En una tercera terminal:

```bash
npm run dev
```

Abre http://localhost:5173

---

## Uso diario

Solo necesitas dos terminales abiertas:

```bash
npx convex dev     # backend
npm run dev        # frontend
```

## Instalar como app de Windows

1. Abre la app en **Chrome** o **Edge**.
2. Haz clic en el icono de **instalar** que aparece en la barra de direcciones
   (o menú ⋮ → "Instalar SurexTodo").
3. Se abrirá en su propia ventana y podrás anclarla a la barra de tareas.

> El service worker de la PWA se activa en la build de producción. Para
> probar la instalación con todo el comportamiento offline:
> `npm run build` y luego `npm run preview`.

## Desplegar en producción

1. Backend: `npx convex deploy`
2. Frontend: hospeda en Vercel / Netlify configurando la variable de entorno
   `VITE_CONVEX_URL` con la URL del deployment de producción.
3. Recuerda actualizar `SITE_URL` en las variables de entorno de Convex con la
   URL pública del frontend.

## Estructura

```
convex/            Backend (esquema, auth y funciones)
  schema.ts        Tablas: profiles, teams, teamMembers, tasks, myDay
  auth.ts          Convex Auth con proveedor de contraseña
  profiles.ts      Nombre de usuario
  teams.ts         Equipos y miembros
  tasks.ts         Tareas, Mi día y Planeado
src/
  components/      UI (sidebar, tareas, panel de detalle…)
  components/views Vistas: Mi día, Planeado, Tareas, Equipo
  util.ts          Tipos y utilidades (prioridades, fechas)
```
