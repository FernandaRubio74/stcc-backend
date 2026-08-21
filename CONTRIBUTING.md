# Guía de Contribución — Ideator

Este documento define cómo trabajamos como equipo en los repositorios del proyecto (`backend`, `frontend`, `docs`). Su objetivo es que cualquier persona del equipo pueda clonar el repo, entender el flujo de trabajo y aportar cambios sin fricción ni ambigüedad.

---

## 1. Flujo de ramas (Branching)

Usamos un modelo simplificado tipo **GitHub Flow adaptado**, con dos ramas permanentes y ramas de trabajo de corta duración.

### Ramas permanentes

| Rama | Propósito | Reglas |
|---|---|---|
| `main` | Código estable, desplegable en cualquier momento | Protegida. Solo se actualiza vía Pull Request aprobado. Nunca se hace push directo. |
| `develop` | Integración de trabajo en curso del sprint actual | Protegida. Todas las `feature/*` y `fix/*` se integran aquí primero. |

### Ramas de trabajo (temporales)

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `feature/` | Nueva funcionalidad o historia de usuario | `feature/US-005-registro-login` |
| `fix/` | Corrección de un bug | `fix/US-007-403-vs-401` |
| `chore/` | Tareas de mantenimiento (configuración, dependencias, CI) | `chore/setup-eslint` |
| `docs/` | Cambios exclusivos de documentación | `docs/actualizar-readme` |
| `hotfix/` | Corrección urgente directo desde `main` (producción) | `hotfix/fix-login-crash` |

**Convención de nombre de rama:** `tipo/ID-descripcion-corta-en-kebab-case`, donde `ID` es el identificador de la Tarea en Jira (ej. `US-014`, `T-020.2`) cuando aplique.

### Reglas del flujo

1. Toda rama de trabajo nace desde `develop` (excepto `hotfix/*`, que nace desde `main`).
2. Al finalizar el trabajo, se abre un **Pull Request hacia `develop`** (nunca directo a `main`).
3. `develop` se fusiona a `main` únicamente al cierre de cada Sprint, una vez validado que el incremento es estable (build verde + pruebas pasando).
4. Una rama de trabajo se elimina automáticamente al hacer merge de su PR (no se dejan ramas obsoletas).
5. Ninguna rama permanente (`main`, `develop`) acepta `push` directo — están protegidas y requieren PR con al menos **1 revisión aprobada**.

```
main        ●────────────────────●──────────────●
             \                  /              /
develop       ●───●───●───●────●──────●───●───●
                \       \      /      /
feature/US-005   ●───●───●    /      /
fix/US-007              ●────●      /
feature/US-014                  ●──●
```

---

## 2. Convención de commits

Usamos **Conventional Commits**. Todo commit debe seguir el formato:

```
<tipo>(<área opcional>): <descripción corta en modo imperativo>

[cuerpo opcional explicando el porqué del cambio]

[footer opcional: referencias a Jira, breaking changes]
```

### Tipos permitidos

| Tipo | Cuándo usarlo |
|---|---|
| `feat` | Nueva funcionalidad visible para el usuario o el sistema |
| `fix` | Corrección de un bug |
| `docs` | Cambios solo de documentación |
| `style` | Cambios de formato que no afectan lógica (espacios, punto y coma, etc.) |
| `refactor` | Cambio de código que no arregla un bug ni agrega funcionalidad |
| `test` | Agregar o corregir pruebas |
| `chore` | Tareas de mantenimiento, dependencias, configuración |
| `ci` | Cambios en pipelines o configuración de integración continua |
| `perf` | Cambios enfocados en mejorar rendimiento |

### Reglas

- El área (`backend`, `frontend`, `database`, `ia`, `auth`) es opcional pero recomendada cuando el commit toca un módulo específico.
- La descripción va en minúscula, en modo imperativo ("agrega", no "agregado" ni "agregando"), sin punto final.
- Si el commit cierra o referencia una tarea de Jira, se incluye en el footer: `Refs: US-005` o `Closes: T-005.2`.
- Los commits deben ser atómicos: un commit = un cambio lógico. Evitar commits tipo "varios cambios" o "wip".

### Ejemplos

```
feat(backend): agrega endpoint de login con emisión de JWT

Implementa POST /auth/login retornando token JWT en caso de éxito
y 401 si las credenciales son inválidas.

Refs: US-005
```

```
fix(auth): corrige código 403 devuelto como 401 en acceso sin permisos

El middleware de autorización no distinguía entre falta de
autenticación y falta de permisos sobre el proyecto.

Refs: US-007
```

```
docs: actualiza instrucciones de variables de entorno en README
```

```
chore(ci): agrega badge de estado de build al README
```

---

## 3. Checklist de Pull Request

Todo Pull Request debe cumplir lo siguiente **antes de solicitar revisión**:

### Antes de abrir el PR

- [ ] La rama está actualizada con `develop` (rebase o merge reciente, sin conflictos).
- [ ] El código compila/build sin errores localmente.
- [ ] Se agregaron o actualizaron pruebas unitarias/funcionales para el cambio realizado.
- [ ] Todas las pruebas pasan localmente.
- [ ] El linter y el formateador se ejecutaron sin errores.
- [ ] No quedan `console.log`, código comentado innecesario ni credenciales hardcodeadas.
- [ ] Si el cambio afecta la base de datos, la migración fue probada en un entorno limpio.
- [ ] Si el cambio afecta un endpoint, la documentación de la API fue actualizada.

### Al redactar el PR

- [ ] Título del PR sigue la convención de commits (ej. `feat(backend): agrega endpoint de invitaciones`).
- [ ] Descripción indica **qué** cambia y **por qué**, no solo el listado de archivos modificados.
- [ ] Se referencia la Tarea de Jira correspondiente (ej. `Refs: US-010`).
- [ ] Se agregan capturas de pantalla o GIF si el cambio incluye UI.
- [ ] Se indica explícitamente si el PR introduce un **breaking change**.

### Durante la revisión

- [ ] Al menos **1 aprobación** de otra persona del equipo antes de hacer merge.
- [ ] Todos los comentarios de la revisión fueron resueltos o respondidos (no se ignoran silenciosamente).
- [ ] El pipeline de CI (build + lint + tests) está en verde.
- [ ] No hay conflictos pendientes con la rama destino.

### Al hacer merge

- [ ] Se usa **Squash and merge** (o el método acordado por el equipo) para mantener el historial de `develop` limpio.
- [ ] El mensaje final del merge sigue la convención de commits.
- [ ] La rama de origen se elimina tras el merge.
- [ ] La Tarea en Jira se mueve manualmente a `Done` (o queda en `In Review` si falta validación adicional en el sprint).

---

## 4. Resumen rápido

1. Crea tu rama desde `develop`: `git checkout -b feature/US-XXX-descripcion`.
2. Haz commits atómicos siguiendo Conventional Commits.
3. Abre PR hacia `develop`, completa el checklist y referencia la tarea de Jira.
4. Espera al menos 1 aprobación y CI en verde.
5. Haz squash and merge, elimina la rama y actualiza el estado en Jira.