/**
 * Especificacion de maquetado de alta fidelidad de una pantalla.
 *
 * Es ADITIVA: vive en el campo opcional `layout` de cada pantalla (ver
 * screen.schema.js), dentro de la misma columna JSON que ya se guarda, asi
 * que no hay migracion ni cambio de contrato. Una pantalla sin `layout`
 * sigue funcionando igual que antes (el renderizador deriva una
 * especificacion minima a partir de `mainElements`).
 *
 * Por que una especificacion estructurada y no HTML de la IA: el HTML libre
 * de un modelo es imposible de validar, no es reproducible y es una via de
 * inyeccion. Aca la IA solo elige COMPONENTES y TEXTOS; el HTML lo escribe
 * un renderizador deterministico que escapa todo.
 */
const { z } = require('zod');

/** Tono semantico de un badge/estado. Vocabulario cerrado a proposito. */
const toneSchema = z.enum(['neutral', 'success', 'warning', 'danger', 'info']);

const dataRefSchema = z
  .object({
    // "Entidad.atributo" del modelo aprobado.
    dataField: z.string().nullable().optional().default(null),
    // "METODO /ruta" de la API aprobada.
    endpointRef: z.string().nullable().optional().default(null),
    // Texto de la regla de negocio que justifica el elemento.
    ruleRef: z.string().nullable().optional().default(null),
  })
  .partial();

const tableColumnSchema = z.object({
  header: z.string().min(1),
  dataField: z.string().nullable().optional().default(null),
  /** 'text' | 'number' | 'badge' | 'date' - define alineacion y formato. */
  kind: z.enum(['text', 'number', 'badge', 'date']).optional().default('text'),
});

const tableRowCellSchema = z.object({
  value: z.string(),
  tone: toneSchema.optional().default('neutral'),
});

const fieldSchema = z.object({
  label: z.string().min(1),
  /** Tipo de control; define como se dibuja, no como se valida. */
  control: z.enum(['text', 'number', 'select', 'textarea', 'date', 'checkbox']).optional().default('text'),
  value: z.string().optional().default(''),
  placeholder: z.string().optional().default(''),
  help: z.string().optional().default(''),
  error: z.string().optional().default(''),
  required: z.boolean().optional().default(false),
  options: z.array(z.string()).optional().default([]),
  dataField: z.string().nullable().optional().default(null),
});

const actionSchema = z.object({
  label: z.string().min(1),
  /** Solo una accion primaria por pantalla (lo valida el renderizador). */
  variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).optional().default('secondary'),
  endpointRef: z.string().nullable().optional().default(null),
  /** Nombre de la pantalla a la que lleva, para el prototipo clicable. */
  navigatesTo: z.string().nullable().optional().default(null),
  /** Roles de dominio que pueden usarla; vacio = todos los de la pantalla. */
  roles: z.array(z.string()).optional().default([]),
});

/** Bloques de contenido. Cada `kind` tiene su propio componente. */
const blockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stats'),
    title: z.string().optional().default(''),
    items: z
      .array(
        z.object({
          label: z.string().min(1),
          value: z.string().min(1),
          delta: z.string().optional().default(''),
          tone: toneSchema.optional().default('neutral'),
          dataField: z.string().nullable().optional().default(null),
        })
      )
      .min(1),
  }),
  z.object({
    kind: z.literal('table'),
    title: z.string().optional().default(''),
    searchable: z.boolean().optional().default(false),
    filters: z.array(z.string()).optional().default([]),
    columns: z.array(tableColumnSchema).min(1),
    rows: z.array(z.array(tableRowCellSchema)).optional().default([]),
    pagination: z.string().optional().default(''),
    rowAction: actionSchema.nullable().optional().default(null),
    refs: dataRefSchema.optional().default({}),
  }),
  z.object({
    kind: z.literal('form'),
    title: z.string().optional().default(''),
    description: z.string().optional().default(''),
    fields: z.array(fieldSchema).min(1),
    submit: actionSchema.nullable().optional().default(null),
    refs: dataRefSchema.optional().default({}),
  }),
  z.object({
    kind: z.literal('cards'),
    title: z.string().optional().default(''),
    items: z
      .array(
        z.object({
          title: z.string().min(1),
          subtitle: z.string().optional().default(''),
          body: z.string().optional().default(''),
          badge: z.object({ text: z.string().min(1), tone: toneSchema.optional().default('neutral') }).nullable().optional().default(null),
          action: actionSchema.nullable().optional().default(null),
        })
      )
      .min(1),
  }),
  z.object({
    kind: z.literal('list'),
    title: z.string().optional().default(''),
    items: z
      .array(
        z.object({
          primary: z.string().min(1),
          secondary: z.string().optional().default(''),
          meta: z.string().optional().default(''),
          badge: z.object({ text: z.string().min(1), tone: toneSchema.optional().default('neutral') }).nullable().optional().default(null),
        })
      )
      .min(1),
    refs: dataRefSchema.optional().default({}),
  }),
  z.object({
    kind: z.literal('detail'),
    title: z.string().optional().default(''),
    items: z
      .array(z.object({ label: z.string().min(1), value: z.string(), dataField: z.string().nullable().optional().default(null) }))
      .min(1),
  }),
  z.object({
    kind: z.literal('text'),
    title: z.string().optional().default(''),
    body: z.string().min(1),
  }),
  z.object({
    kind: z.literal('tabs'),
    items: z.array(z.string().min(1)).min(2),
    active: z.string().optional().default(''),
  }),
]);

/**
 * Textos de los 4 estados ademas del normal. Si la IA no los manda, el
 * renderizador pone textos por defecto en español: los 4 estados tienen que
 * existir SIEMPRE en toda pantalla.
 */
const statesSchema = z
  .object({
    loadingLabel: z.string().optional().default('Cargando…'),
    emptyTitle: z.string().optional().default('Todavía no hay datos'),
    emptyBody: z.string().optional().default(''),
    errorTitle: z.string().optional().default('No se pudo cargar la información'),
    errorBody: z.string().optional().default(''),
    successMessage: z.string().optional().default(''),
  })
  .optional()
  .default({});

const annotationSchema = z.object({
  target: z.string().min(1),
  note: z.string().min(1),
  dataField: z.string().nullable().optional().default(null),
  endpointRef: z.string().nullable().optional().default(null),
  ruleRef: z.string().nullable().optional().default(null),
});

const screenLayoutSchema = z.object({
  /** Titulo visible de la pagina (puede diferir del `name` tecnico). */
  pageTitle: z.string().min(1),
  subtitle: z.string().optional().default(''),
  /** Seccion del menu lateral en la que vive esta pantalla. */
  navSection: z.string().min(1),
  breadcrumbs: z.array(z.string()).optional().default([]),
  /** Unica accion primaria destacada del encabezado. */
  primaryAction: actionSchema.nullable().optional().default(null),
  secondaryActions: z.array(actionSchema).optional().default([]),
  blocks: z.array(blockSchema).min(1),
  states: statesSchema,
  annotations: z.array(annotationSchema).optional().default([]),
  /** Roles de dominio (ej. "Revisador") que usan esta pantalla. */
  roles: z.array(z.string()).optional().default([]),
});

module.exports = {
  screenLayoutSchema,
  blockSchema,
  actionSchema,
  fieldSchema,
  tableColumnSchema,
  annotationSchema,
  toneSchema,
};
