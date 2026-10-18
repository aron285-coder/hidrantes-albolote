# CLAUDE.md — Mapa de hidrantes · Protección Civil de Albolote

Lee este archivo entero al empezar cada sesión. Después, lee **solo** lo que la tarea necesite de
`docs/` (§2). No leas todo `docs/` de golpe: los documentos numerados y los de apoyo los lista
`docs/INDICE.md`, y este archivo te dice cuál abrir.

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
| construir una pantalla | `docs/07-mockups-app.html`, `docs/08-mockups-panel.html` y `docs/mockups/38-panel-*.html` para las listas del panel (abrir con Playwright si hace falta verlas) | — |
| saber qué toca ahora | §5 de este archivo y `docs/09-plan-implementacion.md` §8 (estado de la fase 9) | saltar de fase con la anterior en rojo |
| escribir un texto de interfaz | `docs/06-sistema-de-diseno.md` Apéndice A y `src/lib/textos.ts` | un literal en un componente |
| trabajar en una especificación `docs/NN` | la especificación en la raíz de `docs/` y la skill `paquete-rv` | — |
| buscar un identificador viejo (`docs/24` RV-104) | `docs/INDICE.md`, tabla «Especificaciones archivadas» | tomar una especificación archivada por vigente: lo vigente está en su propietario |
| escribir un test de aceptación | `docs/10-matriz-aceptacion.md` (`AC-nn`) | — |
| tratar datos personales o seguridad | `docs/11-seguridad-y-privacidad.md` | — |
| tomar una decisión no cubierta | `docs/12-decisiones.md` (`DEC-nnn`): añade una entrada | decidir en silencio |
| escribir un procedimiento operativo | `docs/15-continuidad-y-emergencias.md` (emergencias) o `docs/13-manual-jefatura.md` (día a día) | — |

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

**Quién vigila cada regla.** Los hooks de `.claude/settings.json` (DEC-115) bloquean antes de que actúes;
lo demás lo detecta el CI después, o no lo detecta nadie. Donde pone «nadie», la regla depende solo de ti:

| Regla | La vigila |
|---|---|
| `supabase db push` | hook `sin-db-push` |
| esquema `public` en migraciones y seed | hook `sin-esquema-public` (DEC-204) |
| migración aplicada editada o borrada | hook `migraciones-aplicadas`; CI `comprobar-migraciones-nuevas` |
| `git push --force` a `develop` o `main` | hook `sin-force-push` |
| secretos, `.env`, respaldos y fotos en Git | hook `git-add-prohibidos`; `.githooks/pre-commit` (`detectar-secretos`) |
| `console.log` | hook `sin-console-log`; ESLint `no-console` |
| escrituras de `anon`, `execute` de `anon`, Storage de `anon` | pgTAP (`02_permisos`, `05_rpc_voluntario`) y `npm run intrusion` (8 pruebas, en CI) |
| texto de interfaz fuera de `textos.ts`; «defecto» | ESLint (UI-20); `src/lib/textos.test.ts` |
| nombres o correos en lo que llega a un voluntario | pgTAP de las RPC de voluntario; en lo demás, **nadie** |
| bloqueo por fila | pgTAP de concurrencia (05 §11) en las RPC que ya lo tienen; en una RPC nueva, **nadie** |
| tests contra dev o prod; dependencias nuevas sin motivo; controles muertos | **nadie** (la plantilla del PR lo pregunta) |

## 4. Glosario fijo (00 §6)

punto · hidrante / boca de riego · propuesta (pendiente / aprobada / rechazada / retirada por el
autor) · las seis operaciones: alta, revisión, actualizar estado, corregir datos, corregir ubicación,
proponer retirada · caudal/estado: bueno · regular · malo · no funciona · barro (enum
`estado_caudal`; nunca «defecto») · tipo de enganche (solo bocas de riego): Barcelona · Granada · Directo ·
Otro, con los nombres que usa la agrupación y no los de la norma (DEC-194); en el código y en la base se llama
`racor`, en lo que se lee nunca · foto de la conexión / foto del sitio (cuándo es obligatoria cada una: FR-21) ·
retirado (ya no existe) / borrado (papelera) · jefatura / administrador · código de acceso / token de
dispositivo · zona de cobertura · fuera de zona.

## 5. Cómo se trabaja

**Hasta el piloto, DEC-193 (salvo `docs/35`, `docs/36`, `docs/38`, `docs/39`, `docs/40` y `docs/41`, DEC-196, DEC-205, DEC-212, DEC-216, DEC-224 y DEC-228; `docs/37` cabe dentro, DEC-209): congelación.** La aplicación está terminada; lo que queda (#76 a #85) lo hace la
agrupación. Solo entran en `develop`:

1. arreglos de una issue `bloquea-release`;
2. lo que salga de la validación (#76) o del piloto (#77, #78), cada uno con su issue (etiqueta `piloto`);
3. mantenimiento que no cambia lo que ve nadie (dependencias, CI, tareas programadas, estos archivos).

Cualquier otra mejora, tuya o del desarrollador, se anota como issue `tras-piloto` y **no se implementa**. Las
excepciones fueron `docs/35`, `docs/36`, `docs/38`, `docs/39` y `docs/40` (DEC-196, DEC-205, DEC-212, DEC-216 y DEC-224), todas en producción y
archivadas, y **hoy está abierta `docs/41`** (DEC-228): los límites de las fotos vigilados, `rpc()` sin 500 y los
huecos de las pruebas, antes de empezar el piloto;
`docs/42`, la de después del piloto, no se escribe hasta que exista `docs/verificacion/piloto.md`.

1. Qué coger: si te han pedido algo concreto, eso. Si no, la issue `bloquea-release` más antigua y después la
   `piloto` más antigua. **Nunca** una con `organizacion` (es trabajo de personas: validar, dar la sesión,
   comunicar el código) ni una con `tras-piloto`. Si no hay ninguna, dilo y para.
2. Rama `fase-9/nombre-corto` desde `develop`.
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
   nombres de archivos ni códigos internos. Sale tal cual en Novedades (FR-167, DEC-091). **El título de un `feat` o `fix`
   no lleva códigos** (`docs/NN`, `RV-nnn`, `DEC-nnn`): van en el cuerpo, `Refs: docs/40 RV-529` (DEC-225). Con
   `--squash`, el título del PR es el del commit.
   Especificaciones grandes: varias sesiones en paralelo según `docs/trabajo-en-paralelo.md` (DEC-100); el
   reparto exacto lo fija cada especificación.
   Revisado con `pr-review-toolkit` y `code-review`; los hallazgos, resueltos o explicados en el PR
   (DEC-114).
6. CI verde → merge → staging se despliega solo. Comprueba staging con Playwright si el cambio es
   visible.
7. Comprueba que la issue se ha cerrado (si no, ciérrala con un comentario). Si cierra una fase, escribe
   `docs/verificacion/fase-N.md` (qué casos de 10 has ejecutado, cómo, con qué resultado y qué suposiciones has
   tomado) y actualiza `docs/09-plan-implementacion.md` §8: una fase sin ese archivo no está terminada. Si cierra
   una especificación (verificación escrita y release en producción), muévela con `git mv` a
   `docs/archivo/especificaciones/` en ese mismo PR y añádela a la tabla de `docs/INDICE.md` (DEC-195).

**El texto completo de un fallo de seguridad entra en Git cuando producción sirve el arreglo** (DEC-226): su PR enlaza
el `deploy-prod` en verde y la salida de `npm run comprobar-produccion` con la versión y el commit servidos; la rama no se
sube antes.

**RV-139b no escribe en los datos del piloto** (DEC-217): lee; lo que escribe, en una transacción que se deshace; un
solo móvil de prueba, revocado al acabar.

Producción solo por PR `develop → main`, fusionado con **merge commit** (nunca squash), y con el
*environment* `production` aprobado. Lo hace `npm run publicar` (DEC-176, 04 §12.1): empujón y
fusión del PR de release-please, PR `develop → main`, y la puerta automática, que aprueba solo con la
CI de `main` en verde, la comprobación en staging (RV-139b) en verde con el mismo commit,
`comprobar-produccion` sin bloqueo y ninguna issue `bloquea-release`; si no, rechaza y abre la issue.
Antes, `npm run publicar -- --solo-comprobar`. Al cerrar cada bloque de trabajo, publica para que
producción tenga la versión completa de staging (DEC-096). Poner producción al día no abre el acceso: el código real se
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
npm ci                        # sin scripts de instalación: .npmrc con ignore-scripts (DEC-198)
npm rebuild esbuild workerd --ignore-scripts=false   # los dos binarios que necesitan su script
git config core.hooksPath .githooks                  # una vez por clon (ya no lo hace npm)
npx supabase start            # Postgres local con PostGIS; datos efímeros
npm run migrar -- --local     # aplica supabase/migrations con psql
npm run dev                   # Vite en :5173
npm run build && npm run functions:dev   # Pages Functions en :8788 sobre dist/ (vite les pasa /api)
npm test                      # vitest
npm test -- --coverage        # con el informe de cobertura, el mismo que mide la CI (DEC-230)
npm run test:sql              # pgTAP contra la instancia local
npm run e2e                   # Playwright (levanta todo lo anterior); npm run e2e:rapido sin los de rendimiento
npm run typecheck && npm run lint && npm run formato:comprobar   # lo que mira ci-calidad, antes de cada PR
npm run intrusion             # las 8 pruebas de intrusión contra la pila local
npm run zona | callejero | tareas-esperadas | mapabase | comprobar-produccion | publicar | revertir | restaurar | promover-piloto | capturas | purgar-fotos | anonimizar
npm run arranque              # solo la primera vez o para --rotar <secreto[,secreto]|todo>

git switch develop && git pull
git switch -c fase-5/busqueda-local
git add -A && git commit -m "feat(mapa): búsqueda local por código y calle"
git push -u origin HEAD && gh pr create --base develop --fill
```

En Windows, PowerShell o Git Bash desde la carpeta del repositorio; en Git Bash, los comandos que preguntan algo, con
`winpty` (`winpty npm run arranque -- --rotar db`). Los finales de línea los
normaliza `.gitattributes` (`eol=lf`): no cambies esa configuración.

Variables locales en `.env.local` (no se commitea): las genera `npm run arranque -- --local`.

El código de acceso real no sale de ningún comando: lo genera jefatura en Ajustes del panel (13, 15 §5.4).

## 7. Nombres fijos

| Cosa | Nombre |
|---|---|
| Repo GitHub | `aron285-coder/hidrantes-albolote` (**público**, DEC-053) |
| Ramas | `main` (producción) · `develop` (staging) · `fase-N/…` (trabajo) |
| GitHub Environments | `staging` · `production` · `prod-tareas` (secretos de las tareas de producción: sin revisores, solo `develop`, DEC-172) |
| Cloudflare Pages | `hidrantes-albolote` → `hidrantes-albolote.pages.dev` · `hidrantes-albolote-staging` → `hidrantes-albolote-staging.pages.dev` |
| Supabase | proyecto **prod** y proyecto **dev** de la app de uniformidad (refs en `docs/entornos.md`), esquema `hidrantes` en ambos |
| Storage | `hidrantes-fotos` (prod) · `hidrantes-fotos-dev` (dev) |
| R2 (solo si el PMTiles > 20 MB) | `hidrantes-mapabase` · `hidrantes-mapabase-staging` |
| Códigos de punto | `HID-####` · `BOC-####` |
| Prefijo del seed | `[PRUEBA]` en `descripcion` |

## 8. Skills

Las del proyecto están versionadas en `.claude/skills/` (DEC-116) y las tiene cualquier sesión:

| Skill | Úsalo cuando |
|---|---|
| `paquete-rv` | al empezar cualquier paquete de puntos RV/GM de una especificación `docs/NN`, o un arreglo suelto durante la congelación: de la rama a la fusión, con el test que falla antes (DEC-116) |
| `nueva-migracion` | siempre que haya que cambiar una tabla, función, vista, permiso o tarea `pg_cron` (con varias sesiones, solo la Backend) |
| `revisar-pantallas` | en cualquier PR que toque `src/**` o estilos, y cuando se pida una revisión visual de staging: capturas a 412 × 915 y 1280 × 800 (el panel, a 412 × 915 y a 820, 1280 y 1920 × 900, como `vistas.spec.ts`), mirarlas y adjuntarlas |

Instaladas por `npm run arranque` en el PC del desarrollador (04 §15). **No están en Git:** en una sesión nueva o
en la nube pueden faltar. Si faltan, sigue sin ellas; no las instales por tu cuenta.

| Skill | Úsalo cuando |
|---|---|
| `supabase`, `supabase-postgres-best-practices` | RLS, `SECURITY DEFINER`, índices, `pg_cron`, Storage, Auth, Management API |
| `cloudflare` | Pages, Pages Functions, Wrangler, R2, `_headers`, CSP |
| `webapp-testing` | cualquier prueba con Playwright (reconocimiento de selectores, e2e, capturas) |
| `frontend-design` | al construir una pantalla nueva; siempre subordinado a 06 |

Para crear o reformular una issue no hay skill: usa la plantilla `.github/ISSUE_TEMPLATE/tarea.md`, que tiene la
forma de `task-shaper` (Por qué, Qué, Fuera de alcance, Cómo verificar, Criterios).

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
- ¿Es una mejora y aún no ha terminado el piloto? → issue `tras-piloto`, sin implementarla (DEC-193).
- ¿Una regla de §3 que nadie vigila? → mírala dos veces: solo depende de ti.
- Prefiere lo aburrido y probado a lo ingenioso. Es un servicio de emergencias mantenido por
  voluntarios; tiene que seguir funcionando cuando nadie lo mire.
