# CLAUDE.md — Mapa de hidrantes · Protección Civil de Albolote

Lee este archivo entero al empezar cada sesión. Después, lee **solo** lo que la tarea necesite de
`docs/` (§2). No leas todo `docs/` de golpe: son 16 documentos y este archivo te dice cuál abrir.

## 1. Qué es esto

PWA (React + Vite + Leaflet) con Supabase (Postgres/PostGIS, esquema `hidrantes`) y Cloudflare
Pages (+ Pages Functions) para que ~65 voluntarios mantengan el inventario de hidrantes y bocas de
riego de Albolote y Calicasas, y jefatura lo modere desde un panel. Coste 0 €. Español en todo:
código, esquema, UI, commits, comentarios, issues.

Modelo de trabajo: **tú haces prácticamente todo.** El desarrollador interviene unas dos horas en
todo el proyecto (token de Cloudflare, contraseñas de BD, dos aprobaciones en GitHub, cuenta
institucional). Si una tarea parece exigir que él entre en un panel web, es un defecto del plan:
busca la vía por CLI o API y anótalo en `docs/12-decisiones.md`.

Modelo y esfuerzo acordados: **Opus, effort high, para todas las fases** (DEC-044). No bajes el
esfuerzo para ir más rápido.

## 2. Dónde está la verdad (un hecho, una casa)

| Antes de… | lee | nunca |
|---|---|---|
| implementar una regla funcional | `docs/01-requisitos-funcionales.md` (`FR-nn`) | inventar un requisito; si falta, proponlo en 12 y espera |
| ordenar pasos de una pantalla | `docs/02-flujos-de-usuario.md` (`FL-nn`) | — |
| decidir un límite, tiempo o cuota | `docs/03-requisitos-tecnicos.md` (`TR-nn`) | — |
| tocar infraestructura, CI, secretos, entornos | `docs/04-arquitectura-e-infraestructura.md` | crear recursos a mano fuera de `scripts/arranque.ts` |
| tocar una tabla, columna, enum, vista, RLS, RPC o Function | `docs/05-modelo-de-datos-y-api.md` | cambiar una firma sin actualizar 05 primero |
| elegir color, tamaño, tipografía o dibujar un marcador | `docs/06-sistema-de-diseno.md` (§4 = simbología exacta) | inventar tokens |
| construir una pantalla | `docs/07-mockups-app.html`, `docs/08-mockups-panel.html` (abrir con Playwright si hace falta verlas) | — |
| saber qué toca ahora | `docs/09-plan-implementacion.md` (fase en curso + issues abiertas) | saltar de fase con la anterior en rojo |
| escribir un test de aceptación | `docs/10-matriz-aceptacion.md` (`AC-nn`) | — |
| tratar datos personales o seguridad | `docs/11-seguridad-y-privacidad.md` | — |
| tomar una decisión no cubierta | `docs/12-decisiones.md` (`DEC-nnn`): añade una entrada | decidir en silencio |
| escribir un procedimiento operativo | `docs/15-continuidad-y-emergencias.md` | — |

Si dos documentos se contradicen, gana el propietario de esa verdad (`docs/00-README.md` §2) y
corriges el otro en el mismo PR.

**Prototipos vs. documentos:** 07 y 08 son la referencia visual y de interacción (cómo se ve y cómo
se comporta). **Los documentos mandan**: si el prototipo hace algo que 01, 05 o 06 no dicen, no lo
construyas; si dicen cosas distintas, gana el documento y el prototipo se corrige. Un prototipo
nunca crea un requisito.

## 3. Prohibiciones duras

- **Nunca `supabase db push`.** Las migraciones van por `scripts/migrar.ts` con `psql` (04 §5).
- **Nunca tocar el esquema `public`.** Es de la app de uniformidad. Todo va en `hidrantes`.
- **Nunca editar ni borrar una migración aplicada.** Solo hacia adelante; se corrige con otra.
- **Nunca tests contra dev ni prod.** pgTAP y e2e corren contra `supabase start` local y
  `wrangler pages dev`.
- **Nunca `insert`/`update`/`delete` directo desde el frontend.** Todo por RPC `SECURITY DEFINER`.
- **Nunca `execute` para `anon` en `fn_verificar_codigo`, `fn_reservar_subida`,
  `fn_fotos_referenciadas`, `fn_fotos_referenciadas_lista`.** Solo `service_role` desde las Pages
  Functions y los workflows.
- **Nunca políticas de escritura en Storage para `anon`.** Subida solo con URL firmada.
- **Nunca nombres de voluntarios ni correos de administradores en nada que llegue a un
  voluntario** (FR-27): RPC de voluntario, notificaciones, exportaciones.
- **Nunca secretos, `.env` con valores, respaldos ni fotos en Git.** El repositorio es público
  (DEC-053): tampoco nombres de voluntarios, correos ni datos de contacto en issues, PR ni commits.
- **Nunca "defecto".** El cuarto nivel es `no_funciona` / "No funciona".
- **Nunca `console.log` con datos personales.** Errores → `fn_registrar_error`.
- **Nunca un control que no haga nada, un botón deshabilitado sin motivo escrito, una lista sin
  estado vacío ni un fallo silencioso** (06 §9, UI-01 a UI-06).
- **Nunca un texto de interfaz escrito dentro de un componente.** Todos en `src/lib/textos.ts`,
  literales del Apéndice A de 06 (UI-20, UI-21).
- **Nunca una escritura sin bloqueo por fila** en las RPC que cambian puntos o propuestas
  (05 §11), ni una petición de red dentro de una transacción.
- **Nunca dependencias nuevas sin una línea en el PR que diga por qué.** Sin servicios externos
  que exijan cuenta o tarjeta.

Estas reglas las hace cumplir también `.claude/settings.json` (hooks, DEC-115).

## 4. Glosario fijo (00 §6)

punto · hidrante / boca de riego · propuesta (pendiente / aprobada / rechazada / retirada por el
autor) · las seis operaciones: alta, revisión, actualizar estado, corregir datos, corregir ubicación,
proponer retirada · caudal/estado: bueno · regular · malo · no funciona · retirado (ya no existe) /
borrado (papelera) · jefatura / administrador · código de acceso / token de dispositivo · zona de
cobertura · fuera de zona.

## 5. Cómo se trabaja

1. `gh issue list --milestone "Fase N" --state open` → coge la issue más antigua de la fase en curso.
2. Rama `fase-N/nombre-corto` desde `develop`.
3. Lee los documentos que la issue cita. Si algo no está escrito, **no lo inventes**: comenta en la
   issue qué falta, propón una respuesta y añade la decisión en 12 cuando el desarrollador la
   confirme (o cuando sea obvia y de bajo riesgo: entonces decide, anótala en 12 y sigue).
4. Implementa con tests: unitarios (`vitest`) para `src/lib`, pgTAP para SQL, Playwright para
   flujos. La issue no está terminada sin ellos. Comprueba también las reglas UI de 06 §9 en la
   pantalla que toques.
5. PR a `develop` que enlaza la issue con `Closes #N` (en inglés: es la palabra clave de GitHub, y así
   la issue se cierra sola al fusionar; DEC-141), con la plantilla rellena (definición de terminado, 09 §6).
   Commits *conventional* en español: `feat(mapa): …`, `fix(cola): …`, `chore(ci): …`. La descripción
   de un `feat:` o `fix:` con ámbito de usuario se escribe para un voluntario: qué cambia para él, sin
   nombres de archivos ni códigos internos. Sale tal cual en Novedades (FR-167, DEC-091).
   Especificaciones grandes: tres sesiones en paralelo según `docs/trabajo-en-paralelo.md` (DEC-100).
   Revisado con `pr-review-toolkit` y `code-review`; los hallazgos, resueltos o explicados en el PR
   (DEC-114).
6. CI verde → merge → staging se despliega solo. Comprueba staging con Playwright si el cambio es
   visible.
7. Comprueba que la issue se ha cerrado (si no, ciérrala con un comentario); si cierra una fase, escribe `docs/verificacion/fase-N.md` (qué casos de 10 has
   ejecutado, cómo, con qué resultado, y qué suposiciones has tomado) y actualiza
   `docs/09-plan-implementacion.md` §8. Una fase sin ese archivo no está terminada.

Producción solo por PR `develop → main` con aprobación del desarrollador en el *environment*
`production`. Al cerrar cada bloque de trabajo, abre ese PR para que producción tenga la versión
completa de staging (DEC-096). Poner producción al día no abre el acceso: el código real se
comunica en F9.10.

## 6. Entorno local y comandos

**Dónde está todo (Windows):** este repositorio es `C:\Proteccion civil\hidrantes-albolote`. Al
lado, en `C:\Proteccion civil\uniformidad`, está el repositorio de la otra aplicación: es otro
proyecto, **no lo toques**; si necesitas consultar algo de él, pídelo primero. Trabaja siempre desde
la raíz de este repositorio.

**Git:** rama por issue (`fase-N/nombre-corto`) desde `develop`; PR a `develop`; nunca *push* directo
a `main` ni a `develop`; commits *conventional* en español; nunca `git push --force` fuera de tu
rama; nunca añadas secretos, respaldos, fotos ni `.env` (mira el `.gitignore` antes de `git add .`).
Detalle en `docs/04` §11.1.

```
npm install
npx supabase start            # Postgres local con PostGIS; datos efímeros
npm run migrar -- --local     # aplica supabase/migrations con psql
npm run dev                   # Vite en :5173
npx wrangler pages dev        # Pages Functions en :8788 (proxy configurado en vite)
npm test                      # vitest
npm run test:sql              # pgTAP contra la instancia local
npm run e2e                   # Playwright (levanta todo lo anterior)
npm run zona | callejero | tareas-esperadas | mapabase | comprobar-produccion | codigo | revertir | restaurar | promover-piloto | capturas | purgar-fotos
npm run arranque              # solo la primera vez o para --rotar <secreto[,secreto]|todo>

git switch develop && git pull
git switch -c fase-5/busqueda-local
git add -A && git commit -m "feat(mapa): búsqueda local por código y calle"
git push -u origin HEAD && gh pr create --base develop --fill
```

En Windows, PowerShell o Git Bash desde la carpeta del repositorio. Los finales de línea los
normaliza `.gitattributes` (`eol=lf`): no cambies esa configuración.

Variables locales en `.env.local` (no se commitea): las genera `npm run arranque -- --local`.

## 7. Nombres fijos

| Cosa | Nombre |
|---|---|
| Repo GitHub | `aron285-coder/hidrantes-albolote` (**público**, DEC-053) |
| Ramas | `main` (producción) · `develop` (staging) · `fase-N/…` (trabajo) |
| GitHub Environments | `staging` · `production` |
| Cloudflare Pages | `hidrantes-albolote` → `hidrantes-albolote.pages.dev` · `hidrantes-albolote-staging` → `hidrantes-albolote-staging.pages.dev` |
| Supabase | proyecto **prod** y proyecto **dev** de la app de uniformidad (refs en `docs/entornos.md`), esquema `hidrantes` en ambos |
| Storage | `hidrantes-fotos` (prod) · `hidrantes-fotos-dev` (dev) |
| R2 (solo si el PMTiles > 20 MB) | `hidrantes-mapabase` · `hidrantes-mapabase-staging` |
| Códigos de punto | `HID-####` · `BOC-####` |
| Prefijo del seed | `[PRUEBA]` en `descripcion` |

## 8. Skills disponibles (`.claude/skills/`)

| Skill | Úsalo cuando |
|---|---|
| `supabase`, `supabase-postgres-best-practices` | RLS, `SECURITY DEFINER`, índices, `pg_cron`, Storage, Auth, Management API |
| `cloudflare` | Pages, Pages Functions, Wrangler, R2, `_headers`, CSP |
| `webapp-testing` | cualquier prueba con Playwright (reconocimiento de selectores, e2e, capturas) |
| `frontend-design` | al construir una pantalla nueva; siempre subordinado a 06 |
| `task-shaper` | al crear o reformular una issue (Why, fuera de alcance, cómo verificar, checklist) |
| `paquete-rv` | al empezar cualquier paquete de puntos RV/GM de una especificación `docs/NN`: de la rama a la fusión, con el test que falla antes (DEC-116) |
| `nueva-migracion` | siempre que haya que cambiar una tabla, función, vista, permiso o tarea `pg_cron` (solo la sesión Backend) |
| `revisar-pantallas` | en cualquier PR que toque `src/**` o estilos, y cuando se pida una revisión visual de staging: capturas a 412 × 915 y 1280 × 800, mirarlas y adjuntarlas |

**Plugins oficiales de Anthropic** (declarados en `.claude/settings.json`, DEC-114: una sesión nueva
los ofrece al confiar en la carpeta, sin instalar nada):

| Plugin | Úsalo cuando |
|---|---|
| `pr-review-toolkit` | antes de `gh pr merge --auto` de cualquier PR de código. Sobre todo con sus agentes de fallos silenciosos (RV-81 es un caso de manual), de cobertura de tests y de manejo de errores. |
| `code-review` | en cada PR de código, después de `pr-review-toolkit`. Los hallazgos de confianza alta se arreglan en el mismo PR; los demás se anotan en el PR con su motivo. |
| `security-guidance` | siempre activo. Si avisa al tocar `functions/**`, RLS, `grant`, CSP, secretos o `scripts/arranque.ts`, el aviso se contesta en el PR. |

## 9. Cuando dudes

- ¿Es una regla? → 01. ¿Es un campo? → 05. ¿Es un color? → 06. ¿Es una decisión? → 12.
- ¿La tarea exige que el desarrollador haga algo a mano? → busca la vía por CLI/API; si no existe,
  díselo en la issue con el paso exacto y el tiempo que le costará.
- ¿Rompe la versión anterior del frontend? → no puedes: contrato compatible una versión atrás (04 §12).
- ¿Toca datos personales? → 11 antes de escribir código.
- Prefiere lo aburrido y probado a lo ingenioso. Es un servicio de emergencias mantenido por
  voluntarios; tiene que seguir funcionando cuando nadie lo mire.
