# 23 · Novedades que dicen lo que cambió, issues que se cierran solas y release sin runs caducados (25 sep 2026)

| | |
|---|---|
| **Para** | Claude Code, en este repositorio. Dos sesiones en paralelo según `docs/trabajo-en-paralelo.md` (Backend no tiene trabajo aquí). |
| **Base** | `develop` en `72884fa`. Producción en 0.6.4 con la paridad en verde (`docs/22` P-12). |
| **Estado de partida** | typecheck y lint en verde, 1.887 tests de vitest, 42 casos de `probar-hooks.ts`. `git status` queda limpio tras `npm test`. |
| **Origen** | La revisión del 25-09 tras `docs/22`, en staging y en producción. |

## 0. Reparto

| Sesión | Puntos | DEC | `PW_PUERTO` |
|---|---|---|---|
| **Frontend** | RV-95, RV-98 | DEC-142 y 143 | 4174 |
| **Ops** | RV-96, RV-97, P-13 | DEC-140 y 141 | 4175 |

- Coordinación: issue «Coordinación docs/23». Registro de cada sesión en
  `docs/verificacion/novedades-limpieza-<sesión>.md`; Ops los consolida en
  `novedades-limpieza.md`.
- Ops añade la fila de `docs/23` en `docs/INDICE.md`.
- Cada paquete va con la skill `paquete-rv`, y con `pr-review-toolkit` y `code-review` antes de
  fusionar.
- **Qué queda fuera, a propósito:** `src/generado/novedades.json`, que en git va una versión por
  detrás. Es así por diseño: `prebuild` lo regenera siempre y el archivo solo está para el typecheck y
  los tests (ver la decisión en `docs/12` sobre novedades, junto a DEC-079). No se toca.

---

## 1. Frontend

### RV-95 · Novedades enseña funciones viejas con el número de la versión nueva · P1

**Qué se vio.** En Ajustes de la app y del panel, en producción, con la 0.6.4:

```
0.6.4 · Calles, lugares, direcciones y coordenadas
0.6.4 · Los cinco puntos más cercanos que funcionan
0.6.4 · Mantener pulsado el mapa abre "¿Qué hay aquí?", y la ficha enseña las coordenadas…
```

Esas tres líneas son `feat:` de versiones anteriores (0.6.0 y 0.6.1). Lo que sí cambió en la 0.6.4 no
sale:

- "activar los avisos dice qué ha fallado y cómo arreglarlo"
- "los avisos se activan de verdad y ya no se pierden por un fallo pasajero"
- "los botones del mapa van pegados al borde y «Cercanos» abajo"

Es justo lo que los voluntarios que vieron fallar los avisos necesitan leer. Y el número que se
enseña al lado es falso.

**Causa.** `scripts/generar-novedades.ts`, `novedadesDe()`:

1. Recorre primero **todas** las `novedades` de **todas** las versiones y solo después las
   `correcciones`. Mientras en el CHANGELOG haya tres `feat:` de usuario en cualquier versión, ninguna
   corrección sale nunca.
2. Devuelve una sola `version` (la última), y `cargarNovedades()` la pone delante de cada línea.

**Solución.**

1. **El JSON guarda la versión de cada línea:** `lineas: { version: string; texto: string }[]`. Se
   mantienen `version` y `fecha` de arriba (la última release), para Ajustes de la app.
2. **Orden:** versión a versión, de la más reciente a la más antigua. Dentro de cada versión, primero
   las `novedades` y luego las `correcciones`. Se para al llegar a `MAX_LINEAS` (3).
   - Con el CHANGELOG de hoy salen las tres primeras líneas de usuario de la 0.6.4, que son todas de
     `avisos` y `mapa`.
   - Los filtros de siempre se quedan como están: `AMBITOS_USUARIO`, `TECNICA` y la eliminación de
     duplicados.
3. **Dos correcciones del mismo ámbito que dicen casi lo mismo** (como los dos `panel:` de Salud del
   sistema) cuentan como una: dentro de una versión, como mucho **dos líneas por ámbito**. Así no se
   comen el hueco de un tercer tema.
4. **Todos los que leen el JSON usan la `version` de cada línea:**
   - `src/lib/novedades.ts`
   - `src/lib/panel/ajustes.ts` `cargarNovedades()`
   - `src/paginas/Ajustes.tsx`
   - `src/componentes/AvisoNovedades.tsx`, el aviso tras actualizar que monta `Armazon.tsx`.
     Este sigue avisando por la `version` de arriba.
5. **Compatibilidad:** si `lineas` llega como `string[]` (el JSON viejo que hay en git), se leen con la
   `version` de arriba. Sin eso, el typecheck o un build a medias fallan.
6. **Documentación:** en `docs/01`, FR-167 (o en el apartado de 06 que describe Novedades) cambia "las
   últimas líneas" por "lo último de cada versión, con su número". Anótalo en DEC-142.

**Tests** (`scripts/generar-novedades.test.ts`):

- **El caso de hoy.** Un CHANGELOG con la 0.6.4 (solo `### Correcciones`, 7 líneas de usuario) y la
  0.6.0 (`### Novedades`, 3 líneas) da tres líneas de la 0.6.4, cada una con `version: '0.6.4'`, y
  ninguna de la 0.6.0.
- Una versión con 1 novedad y 1 corrección, más otra anterior con 2 novedades: salen la novedad y la
  corrección de la última (con su número) y una de la anterior (con el suyo).
- Tres correcciones del mismo ámbito en una versión: entran dos y la tercera línea viene de otro
  ámbito o de otra versión.
- Los tests que ya existen de `TECNICA`, `limpiar()` y `MAX_CARACTERES` siguen en verde, adaptados a
  la forma nueva.
- En `src/lib/panel/ajustes.test.ts` (o donde se pruebe `cargarNovedades`), el formato viejo
  `string[]` también se lee.
- Un e2e de `e2e/panel-ajustes.spec.ts` comprueba que cada línea de Novedades lleva su propio número.

### RV-98 · En staging, "Almacenamiento usado: sin dato" para siempre · P2

**Qué se vio.** La purga de fotos (`purgar-fotos.yml`) solo mira el bucket de producción. En staging,
Salud del sistema dice siempre "Almacenamiento usado · sin dato", y parece una avería.

**Solución.** Lo mismo que ya hace "Último respaldo" en staging ("no se respalda: entorno de
pruebas"):

1. Con el mismo criterio de entorno que usa esa fila, y con `storage_bytes` a `null`, se enseña
   "no se mide en pruebas".
2. El texto va en `src/lib/textos.ts` y en el Apéndice A de `docs/06`.
3. En producción no cambia nada: `null` sigue siendo "sin dato".

**Tests:** vitest de `textoAlmacenamiento()` (o de la fila de `Ajustes.tsx`) en los dos entornos,
con `storage_bytes` a `null` y con un número. Captura con `revisar-pantallas`.

---

## 2. Ops

### RV-96 · Las issues no se cierran solas: la plantilla usa «Cierra #» · P2

**Qué se vio.**

- La issue #326 (Lighthouse de staging en 0,84) sigue abierta. #327 la arregló el 24-09 y los
  despliegues de staging están en verde desde entonces.
- La plantilla de PR empieza con `Cierra #`. GitHub solo cierra issues con sus palabras clave en
  inglés (`Closes`, `Fixes`, `Resolves`), así que ninguna issue se cierra al fusionar.
- La skill `paquete-rv` ya lo avisa ("ciérrala a mano"), pero eso depende de acordarse.

**Solución.**

1. **`.github/PULL_REQUEST_TEMPLATE.md`**, primera línea: `Closes #` y, debajo, el comentario
   `<!-- Palabra clave de GitHub: tiene que ir en inglés para que la issue se cierre al fusionar. -->`.
2. **`.claude/skills/paquete-rv/SKILL.md`**, paso 10: cambia "«Cierra #N» en español no cierra la
   issue: ciérrala a mano" por "En la descripción del PR, `Closes #N` (en inglés: es la palabra clave
   de GitHub). Las casillas de la issue de coordinación se marcan a mano."
3. **CLAUDE.md** y **`docs/trabajo-en-paralelo.md`**: donde digan "cierra la issue", la misma
   indicación.
4. **Cerrar #326** con un comentario de una línea: qué lo arregló (#327) y los despliegues de staging
   en verde desde el 24-09. Revisa también si hay otras issues abiertas ya resueltas por un PR
   fusionado:
   - Las F9.x (#76 a #85) son tareas de personas y **no** se cierran.
   - Las que cierres, anótalas en el registro.

**Test:** en `scripts/herramientas.test.ts`, la plantilla de PR contiene `Closes #` y no contiene
`Cierra #`.

### RV-97 · Cada release deja runs de CI "caducados" en rojo · P2 · necesita al desarrollador

**Qué se vio.** En Actions → *Failure* aparecen runs de CI y de "Fusión automática de Dependabot"
sobre la rama `release-please--branches--develop--…`:

- #549 (0.6.1), #570 (0.6.2), #617 (0.6.3) y #693 (0.6.4).
- El error: *"This workflow run required approval but was not approved before it expired"*.

No son fallos de código, pero llenan la lista de fallos y esconden los de verdad.

**Causa.** release-please abre y actualiza su PR con `GITHUB_TOKEN`. Lo que hace ese token no
dispara la CI (DEC-079), y los runs del bot quedan esperando una aprobación que nadie da. Por eso
también hace falta hoy "el empujón de una persona" que describe `release-please.yml`.

**Solución recomendada: una GitHub App propia para release-please.** Anótalo en DEC-140.

1. **El desarrollador crea la App** en GitHub (Settings → Developer settings → GitHub Apps) con:
   - Contents: Read & write
   - Pull requests: Read & write
   - Actions: Read

   La instala solo en este repositorio. Guarda `RELEASE_APP_ID` como variable y
   `RELEASE_APP_KEY` como secreto del repositorio.
   - Ops le deja los pasos exactos en `docs/15` (§ de credenciales) antes de pedírselo.
   - Claude Code nunca maneja la clave.
2. **`release-please.yml`:**
   - Un paso `actions/create-github-app-token@v2` con esa App.
   - `token: ${{ steps.app.outputs.token }}` en `release-please-action`.
   - Se quitan el `gh workflow run ci.yml` y el texto del "empujón": con el token de la App, el PR de
     versión dispara la CI normal y los checks cuentan.
3. **Mientras la App no exista, nada cambia.** Si falta `RELEASE_APP_ID`, el workflow sigue como
   hoy, con `GITHUB_TOKEN` y el aviso del empujón. Así el PR se puede fusionar antes de que el
   desarrollador cree la App.
4. **`docs/04` §11.1 y DEC-079:** una línea que diga que queda sustituida por DEC-140 cuando la App
   está puesta.

**Descartado:** un token personal (PAT). Caduca, va ligado a una persona y da más permisos de los
necesarios.

**Tests** (en `scripts/workflows.test.ts`):

- `release-please.yml` usa `create-github-app-token`.
- Tiene la rama de reserva sin `RELEASE_APP_ID`.
- No aparece ninguna clave en claro.

**Comprobación.** En la siguiente release, el PR de versión tiene los checks del PR sin empujón y no
aparece ningún run "expired". Anótalo en el registro. Si la App aún no existe, anota "pendiente del
desarrollador".

### P-13 · Producción al día al cerrar

Igual que `docs/22` P-12:

- Release, PR `develop → main` con merge commit, las dos aprobaciones del desarrollador y la paridad
  en verde. Anótalo en `paridad-produccion.md`.
- Comprueba en producción que Novedades enseña las líneas de la versión nueva, cada una con su
  número (RV-95).
- Si P-12 aún no las tenía anotadas, anota también las comprobaciones del 27-09 (respaldo) y del
  28-09 (primera purga en ensayo, con su issue).

---

## 3. Lo que hace el desarrollador (no Claude Code)

1. **RV-97:** crear la GitHub App y guardar `RELEASE_APP_ID` y `RELEASE_APP_KEY` (unos 10 minutos,
   con los pasos que deje Ops en `docs/15`).
2. **P-13:** las dos aprobaciones de producción.
3. **Siguen pendientes de `docs/22` §4:**
   - la prueba de los avisos en el Android;
   - la comprobación del lunes 28-09;
   - limpiar staging antes del piloto.

---

## 4. Checklist final

- [ ] RV-95: en producción, Novedades enseña las líneas de la última versión, cada una con su número,
      y el test del caso de la 0.6.4 está en verde.
- [ ] RV-98: en staging, "Almacenamiento usado · no se mide en pruebas".
- [ ] RV-96: la plantilla de PR usa `Closes #`; #326 está cerrada; la siguiente issue de código se
      cierra sola al fusionar su PR.
- [ ] RV-97: fusionado con reserva; con la App puesta, la siguiente release sale sin runs "expired" y
      sin empujón.
- [ ] P-13: producción en la versión nueva, con la paridad en verde.
