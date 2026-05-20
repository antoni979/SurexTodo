# SurexTodo

Aplicación web de gestión de tareas personales y de equipo, al estilo de
Microsoft To Do. Instalable como app de escritorio (PWA) en Windows.

- **App en producción:** _(pendiente de añadir la URL de Vercel)_
- **Código:** https://github.com/antoni979/SurexTodo

---

## Índice

1. [Qué es SurexTodo](#1-qué-es-surextodo)
2. [Funcionalidades](#2-funcionalidades)
3. [Guía rápida de uso](#3-guía-rápida-de-uso)
4. [Arquitectura técnica](#4-arquitectura-técnica)
5. [Modelo de datos (backend)](#5-modelo-de-datos-backend)
6. [Funciones del backend](#6-funciones-del-backend)
7. [Cómo funciona la lógica clave](#7-cómo-funciona-la-lógica-clave)
8. [Infraestructura y despliegue](#8-infraestructura-y-despliegue)
9. [Desarrollo en local](#9-desarrollo-en-local)
10. [Estructura de archivos](#10-estructura-de-archivos)

---

## 1. Qué es SurexTodo

SurexTodo es un gestor de tareas pensado para uso personal y para equipos de
trabajo. Cada usuario tiene su lista privada de tareas y, además, puede crear
equipos donde las tareas se comparten y se asignan a personas concretas.

Está inspirada en Microsoft To Do: tiene una vista de "Mi día", una de
"Planeado" (tareas con fecha de vencimiento) y carpetas de equipo.

---

## 2. Funcionalidades

### Cuentas de usuario
- Registro e inicio de sesión con **email y contraseña**.
- La primera vez que entras, eliges un **nombre de usuario** (p. ej. "Laura").
  Ese nombre es el que usan tus compañeros para añadirte a sus equipos.

### Tareas
Cada tarea tiene:
- **Título**.
- **Prioridad**: Baja, Media, Alta o Súper urgente.
- **Fecha de vencimiento** (opcional).
- **Nota** de texto libre (opcional).
- Estado **completada / pendiente**.
- **Periodicidad** (opcional): la tarea se repite automáticamente.

### Prioridades
Cuatro niveles con color: Baja (gris), Media (azul), Alta (naranja),
Súper urgente (rojo). Las tareas se ordenan dando prioridad a las más urgentes.

### Periodicidad (tareas que se repiten)
Una tarea puede repetirse:
- **Todos los días**
- **Días laborales** (lunes a viernes)
- **Todas las semanas**
- **Todos los meses**
- **Días concretos** que tú elijas (L, M, X, J, V, S, D)

Cuando marcas como completada una tarea con periodicidad, **se crea
automáticamente la siguiente** con la fecha calculada. La tarea completada
queda en el histórico ("Completadas").

### Vistas
- **Mi día**: las tareas que has planeado para hoy. Puedes añadir cualquier
  tarea a "Mi día" con el botón del sol. Se reinicia cada día.
- **Planeado**: todas tus tareas con fecha de vencimiento, agrupadas en
  *Vencidas*, *Hoy*, *Mañana* y *Próximamente*.
- **Tareas**: todas tus tareas personales.
- **Equipos**: una carpeta por cada equipo al que perteneces.

### Equipos
- Cualquier usuario puede **crear equipos** y **añadir miembros** buscándolos
  por su nombre de usuario en un desplegable con buscador.
- Las tareas de un equipo son visibles para todos sus miembros.
- Una tarea de equipo se puede **asignar** a un miembro concreto.
- **Regla especial:** si una tarea de equipo tiene fecha de vencimiento, solo
  aparece en la vista "Planeado" de la persona a la que está asignada (no en la
  de todo el equipo).

### App instalable (PWA)
La web se puede instalar como aplicación de escritorio en Windows (Chrome o
Edge → icono de instalar en la barra de direcciones).

---

## 3. Guía rápida de uso

1. Entra en la app y **regístrate** con tu email y una contraseña.
2. Elige tu **nombre de usuario**.
3. En **Tareas** o **Mi día**, escribe una tarea, elige prioridad/fecha y pulsa
   "Agregar".
4. Pulsa una tarea para abrir el panel de detalle: ahí cambias prioridad,
   fecha, periodicidad, nota o la eliminas.
5. Para trabajar en equipo: pulsa **"Nuevo equipo"**, dale nombre, y luego
   **"Añadir miembro"** para buscar a tus compañeros por su nombre de usuario.
6. Dentro de un equipo, crea tareas y asígnalas a un miembro.

---

## 4. Arquitectura técnica

```
   Navegador (PWA)                Convex Cloud
 ┌──────────────────┐         ┌────────────────────┐
 │  React + Vite    │  <──>   │  Base de datos     │
 │  (interfaz)      │  tiempo │  Funciones (API)   │
 │                  │   real  │  Autenticación     │
 └──────────────────┘         └────────────────────┘
   alojado en Vercel            hearty-hyena-437
```

### Frontend
- **React 18 + Vite + TypeScript**.
- **PWA** (instalable) mediante `vite-plugin-pwa`.
- Se comunica con el backend mediante el cliente de Convex, que mantiene los
  datos **sincronizados en tiempo real** (si alguien cambia una tarea de
  equipo, los demás la ven al instante sin recargar).

### Backend
- **Convex** (https://convex.dev): plataforma que proporciona base de datos,
  funciones de servidor y autenticación, todo gestionado.
- No hay servidor propio que mantener: las "funciones" (queries y mutations)
  son código TypeScript que se ejecuta en Convex.

### Autenticación
- **Convex Auth** con proveedor de **email + contraseña**.
- Las contraseñas se guardan cifradas (hash). El backend firma tokens JWT con
  un par de claves RSA almacenado como variables de entorno del deployment
  (`JWT_PRIVATE_KEY`, `JWKS`).

---

## 5. Modelo de datos (backend)

Las tablas se definen en `convex/schema.ts`.

| Tabla | Campos | Para qué sirve |
|-------|--------|----------------|
| `profiles` | `userId`, `username` | Nombre de usuario elegido por cada persona. |
| `teams` | `name`, `ownerId` | Equipos. |
| `teamMembers` | `teamId`, `userId` | Relación: qué usuarios pertenecen a qué equipo. |
| `tasks` | `title`, `priority`, `completed`, `dueDate?`, `note?`, `creatorId`, `teamId?`, `assigneeId?`, `recurrence?` | Las tareas (personales y de equipo). |
| `myDay` | `userId`, `taskId`, `date` | Qué tareas ha puesto cada usuario en "Mi día" y qué día. |

Una tarea es **personal** si no tiene `teamId`; es **de equipo** si lo tiene.
`recurrence` es un objeto `{ type, days? }` donde `type` es
`daily | weekdays | weekly | monthly | custom`.

Además, Convex Auth crea sus propias tablas (`users`, `authAccounts`,
`authSessions`, etc.) para gestionar las cuentas y las sesiones.

---

## 6. Funciones del backend

Cada función es una **query** (lectura) o una **mutation** (escritura).

### `convex/profiles.ts`
- `me` *(query)* — devuelve el usuario actual y su nombre de usuario.
- `setUsername` *(mutation)* — guarda/cambia el nombre de usuario (comprueba
  que no esté repetido).

### `convex/teams.ts`
- `listMyTeams` *(query)* — equipos a los que perteneces.
- `createTeam` *(mutation)* — crea un equipo y te añade como miembro.
- `getTeam` *(query)* — datos de un equipo y su lista de miembros.
- `listAddableUsers` *(query)* — usuarios que aún no están en el equipo
  (para el buscador de "Añadir miembro").
- `addMember` *(mutation)* — añade un usuario al equipo.
- `leaveTeam` *(mutation)* — salir de un equipo.

### `convex/tasks.ts`
- `listPersonal` *(query)* — tus tareas personales.
- `listTeamTasks` *(query)* — tareas de un equipo.
- `listMyDay` *(query)* — tus tareas de "Mi día" para hoy.
- `listPlanned` *(query)* — tus tareas con vencimiento (personales + las de
  equipo asignadas a ti).
- `createTask` *(mutation)* — crea una tarea.
- `updateTask` *(mutation)* — edita título, prioridad, fecha, nota,
  asignación o periodicidad.
- `toggleComplete` *(mutation)* — marca/desmarca como completada (y genera la
  siguiente si la tarea es periódica).
- `deleteTask` *(mutation)* — elimina una tarea.
- `setMyDay` *(mutation)* — añade/quita una tarea de tu "Mi día".

### `convex/seed.ts`
- `setProfile` *(función interna de administración)* — asigna un nombre de
  usuario a una cuenta por su email. No es accesible desde la app; solo se usa
  desde la línea de comandos.

Todas las funciones comprueban permisos: solo puedes ver/editar tus tareas
personales y las tareas de los equipos a los que perteneces.

---

## 7. Cómo funciona la lógica clave

### Mi día
"Mi día" es por usuario y por fecha. Cuando añades una tarea a "Mi día" se
guarda una fila en la tabla `myDay` con tu `userId`, el `taskId` y la fecha de
hoy. La vista "Mi día" muestra las tareas cuya fila coincide con la fecha
actual, por eso se "reinicia" cada día.

### Planeado
La vista "Planeado" reúne:
- Tus **tareas personales** con fecha de vencimiento.
- Las **tareas de equipo asignadas a ti** con fecha de vencimiento.

Y las agrupa comparando la fecha con hoy: Vencidas / Hoy / Mañana /
Próximamente. Como solo se incluyen las tareas de equipo *asignadas a ti*, una
tarea de equipo con vencimiento aparece únicamente en el "Planeado" de su
responsable.

### Periodicidad / recurrencia
Cuando completas una tarea que tiene `recurrence`:
1. Se calcula la **siguiente fecha** a partir de la fecha de vencimiento
   actual (o de hoy si no tenía) según el tipo de repetición.
2. Se **crea una nueva tarea** igual (mismo título, prioridad, equipo,
   asignación…) con esa fecha y la misma periodicidad.
3. La tarea original se queda marcada como completada (histórico).

El cálculo de "todos los meses" ajusta los meses cortos (p. ej. 31 de enero →
28/29 de febrero).

---

## 8. Infraestructura y despliegue

### Backend — Convex
- Proyecto: `surextodo-d22e6`.
- Deployment de producción: **`hearty-hyena-437`**
  (`https://hearty-hyena-437.convex.cloud`).
- Panel: https://dashboard.convex.dev/d/hearty-hyena-437

### Frontend — Vercel + GitHub
- El código vive en GitHub: `antoni979/SurexTodo`.
- Vercel está conectado a ese repositorio: **cada vez que se sube un cambio a
  la rama `main`, Vercel reconstruye y publica la web automáticamente**.

### Variables de entorno
- En **Vercel**: `VITE_CONVEX_URL = https://hearty-hyena-437.convex.cloud`
  (le dice al frontend dónde está el backend).
- En **Convex** (deployment de producción): `JWT_PRIVATE_KEY`, `JWKS` y
  `SITE_URL`, necesarias para la autenticación. No están en el repositorio.

---

## 9. Desarrollo en local

Requisitos: [Node.js](https://nodejs.org) 18 o superior.

```bash
# 1. Instalar dependencias
npm install

# 2. Backend de desarrollo (deja este comando corriendo)
npx convex dev

# 3. Frontend de desarrollo (en otra terminal)
npm run dev
```

La app de desarrollo se abre en http://localhost:5173 y usa un deployment de
Convex de *desarrollo*, separado del de producción.

Para subir cambios a producción basta con hacer `git push` a `main`
(Vercel publica el frontend). El backend se despliega con
`npx convex deploy`.

---

## 10. Estructura de archivos

```
surextodo/
├── convex/                 Backend (Convex)
│   ├── schema.ts           Definición de las tablas
│   ├── auth.ts             Configuración de Convex Auth
│   ├── profiles.ts         Funciones de nombre de usuario
│   ├── teams.ts            Funciones de equipos
│   ├── tasks.ts            Funciones de tareas, Mi día y Planeado
│   └── seed.ts             Utilidad de administración
├── src/                    Frontend (React)
│   ├── App.tsx             Punto de entrada / control de sesión
│   ├── util.ts             Tipos y utilidades (prioridades, fechas)
│   ├── components/         Componentes de interfaz
│   │   └── views/          Vistas: Mi día, Planeado, Tareas, Equipo
│   └── index.css           Estilos
├── public/                 Iconos / recursos estáticos
├── index.html
├── package.json
└── vite.config.ts          Configuración de Vite + PWA
```

---

_Generado como documentación del proyecto SurexTodo._
