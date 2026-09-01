# Autorización — roles y matriz de permisos

> **T-008.2** · Reglas de negocio de `US-008 - Modelo de roles y permisos por proyecto`.
>
> La implementación de esta tabla vive en [`src/common/utils/permissions.js`](../../src/common/utils/permissions.js)
> y está cubierta por `tests/unit/permissions.test.js` (T-008.4). **Si cambiás
> una, cambiá las dos**: el test recorre la matriz completa y falla si divergen.

## 1. Los tres roles

Cada proyecto es privado por defecto. El acceso se resuelve **siempre** vía la
tabla `project_members`, nunca asumiendo que el frontend ya filtró. Un usuario
sin fila en esa tabla no tiene ningún permiso sobre el proyecto.

| Rol | Para quién es |
|---|---|
| `owner` | Quien creó el proyecto. Se le asigna automáticamente al crearlo, en la misma transacción. Manda sobre la membresía y sobre la existencia del proyecto. |
| `editor` | Colabora en el contenido: dialoga con la IA, genera y corrige las etapas de especificación. |
| `viewer` | Observa. Lectura estricta, sin capacidad de modificar ni de llevarse los documentos. |

`viewer` es el valor por defecto del enum en la base (`DEFAULT 'viewer'`): si
alguien agrega una membresía sin especificar rol, cae en el rol más restrictivo.
Eso es deliberado — el default de un sistema de permisos nunca debe ser el
permisivo.

## 2. La matriz

| Permiso | `owner` | `editor` | `viewer` | Qué habilita |
|---|:---:|:---:|:---:|---|
| `project:read` | ✅ | ✅ | ✅ | Ver el proyecto y sus etapas |
| `project:update` | ✅ | ✅ | ❌ | Editar nombre y descripción |
| `project:delete` | ✅ | ❌ | ❌ | Borrar el proyecto |
| `member:read` | ✅ | ✅ | ✅ | Ver quiénes son los miembros |
| `member:invite` | ✅ | ❌ | ❌ | Sumar gente al proyecto |
| `member:update_role` | ✅ | ❌ | ❌ | Cambiar el rol de un miembro |
| `member:remove` | ✅ | ❌ | ❌ | Quitar a un miembro |
| `spec:generate` | ✅ | ✅ | ❌ | Dialogar con la IA para generar una etapa |
| `spec:update` | ✅ | ✅ | ❌ | Editar el resultado de una etapa |
| `document:export` | ✅ | ✅ | ❌ | Descargar los `.md` finales |

### Las tres decisiones que no son obvias

**Solo `owner` gestiona miembros.** Un `editor` no puede invitar ni cambiar
roles. Es lo más conservador: si un editor pudiera invitar, podría sumar a otro
editor, y la membresía dejaría de tener un responsable único.

**`viewer` no exporta documentos.** Puede leer todo en pantalla, pero no
descargar los `.md` generados. La especificación técnica es *el entregable* del
producto; difundirla es una decisión de quien tiene responsabilidad sobre el
proyecto, no de cualquiera con acceso de lectura.

**Los tres roles ven la lista de miembros.** Saber con quién se comparte un
proyecto es parte de leerlo, y no expone nada que un colaborador no pueda
deducir igual trabajando.

## 3. Cómo se aplica en el código

Los tres middlewares se encadenan y cada uno responde una pregunta distinta:

```js
router.get(
  '/:projectId',
  requireAuth,                              // ¿quién sos?            -> 401
  requireProjectMembership,                 // ¿entrás al proyecto?   -> 404 / 403
  requirePermission(PERMISSIONS.PROJECT_READ), // ¿podés hacer ESTO?  -> 403
  getProjectController
);
```

**Preguntá por permiso, no por rol.** Escribí
`requirePermission(PERMISSIONS.MEMBER_INVITE)` y no `if (role === 'owner')`. Si
mañana se agrega un rol `admin`, o el equipo decide que `editor` sí puede
invitar, se toca **una sola línea** de la matriz y no veinte call sites
desparramados con cada uno su propia versión de la verdad.

## 4. Códigos de respuesta

| Situación | Código | Cuerpo |
|---|---|---|
| Sin token, o token inválido/expirado | `401` | `{ error: 'No autenticado' }` |
| El proyecto no existe | `404` | `{ error: 'Proyecto no encontrado' }` |
| Existe, pero no sos miembro | `403` | `{ error: 'No tenes acceso a este proyecto' }` |
| Sos miembro, pero tu rol no alcanza | `403` | `{ error: 'No tenes permiso para realizar esta accion', requiredPermission, role }` |

Esto sigue la DoD de `US-007`: *"Sin identidad valida -> 401. Con identidad pero
sin permisos -> 403"*.

> ⚠️ **Costo conocido de distinguir 403 de 404.** Como un proyecto ajeno
> responde `403` y uno inexistente `404`, cualquier usuario autenticado puede
> enumerar UUIDs y averiguar **qué proyectos existen**, aunque no acceda a
> ninguno. No filtra su contenido, pero sí su existencia. La alternativa —
> `404` uniforme para ambos casos — cierra esa filtración a cambio de una
> respuesta menos clara para el cliente. Se eligió cumplir la DoD al pie de la
> letra; si más adelante pesa más la privacidad, el único cambio necesario es
> devolver `404` en la rama del `403` de
> [`project-member.middleware.js`](../../src/common/middlewares/project-member.middleware.js).

## 5. Alcance actual

La matriz está **definida, implementada y testeada**, pero solo
`project:read` está cableado a un endpoint real (`GET /projects/:projectId`),
porque son los únicos endpoints de proyecto que existen hoy.

Los permisos de miembros (`member:*`), de especificación (`spec:*`) y de
exportación (`document:export`) están definidos por adelantado a propósito:
cuando se implementen `US-010` (gestión de miembros) y las etapas de Ideator,
la regla ya está escrita en un solo lugar y solo hay que consumirla.
