# Registro de `docs/40` · Revisión tras `docs/39`

Una línea por PR: qué entró, el test que falló antes (o «sin test: documentación») y el número del PR.

- **RV-528:** puesta en marcha. 12 v1.70 (DEC-224 a DEC-226, sus filas del índice y `docs/41` en DEC-193, DEC-196, DEC-205,
  DEC-209, DEC-212 y DEC-216); CLAUDE.md §5 (`docs/40` como excepción, `docs/41` la de después del piloto, DEC-225 en los
  commits y DEC-226); skill `paquete-rv`; 09 §8; INDICE; `docs/40-revision-tras-39.md` entra en Git; issues de los puntos y
  las 6 `tras-piloto` de §0.4 (#878 a #887 y #888 a #893). Sin test: documentación.
- **RV-529:** Novedades enseña lo de 0.17.0. `limpiar()` quita también «(docs/NN RV-nnn, DEC-nnn)»; `propuestas`, `estilo` y
  `textos` pasan a ámbitos de usuario (los internos desde 0.10.0, en un comentario con su motivo); las líneas de 0.17.0 del
  CHANGELOG, sin «(docs/39 RV-5xx)»; `src/generado/novedades.json` regenerado (tres líneas de 0.17.0). Tests que fallaban
  antes: los tres nuevos de `scripts/generar-novedades.test.ts`, uno con el CHANGELOG real (cada línea de ámbito de
  usuario de la última versión vale para Novedades: el tope de 3 líneas y 2 por ámbito decide cuáles salen). 10 v1.10,
  AC-192.
- **RV-530:** `arranque --rotar db` guarda la cadena nueva del migrador en los secretos de GitHub (la del entorno y la de las
  tareas) y la enseña en cuanto la clave funciona, antes de la pregunta de PostGIS, de Pages y del Worker
  (`guardarCadenaMigrador`, y el bucle por entorno en `arrancarEntorno`); si el Worker rechaza después, el mensaje dice que
  la clave ya está cambiada y guardada; el recuadro dice «staging» o «producción»; sin terminal, nombra PowerShell y
  `winpty`. Tests que fallaban antes: los cinco nuevos o cambiados de `scripts/arranque.test.ts` (el orden, el Worker que
  rechaza, la etiqueta y `motivoSinTerminal`). 15 v1.10 (§2 y §5.3); CLAUDE.md §6.
- **RV-531:** los avisos de fallo no escriben en la base que la guarda ha rechazado: en `respaldo.yml` (los dos trabajos),
  `purgar-fotos.yml` y `deploy-prod.yml`, la guarda con `id` (en `deploy-prod`, `guarda-produccion` y un
  `comprobar-cadena` nuevo antes de migrar) y el aviso técnico con `steps.<guarda>.outcome == 'success'`;
  `comprobar-cadena --url` comprueba la URL de la API (`https://<ref>.supabase.co`) y `purgar-fotos.yml` la usa para
  `SUPABASE_URL_PROD`. Tests que fallaban antes: los siete nuevos de `scripts/workflows.test.ts` (la guarda con id y sin
  `if:`, y todo paso tras un fallo que usa la base depende de ella) y los de `comprobar-cadena --url`. 04 v1.11 (§9).
