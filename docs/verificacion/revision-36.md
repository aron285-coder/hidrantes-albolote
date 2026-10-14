# Verificación · `docs/36` (lo que encontró la revisión tras `docs/35`)

Registro de lo que ha entrado de `docs/36`, PR a PR, con redacción neutra: qué cambia y cómo se ha
comprobado, no cómo se aprovechaba (el repositorio es público). Cada punto con código lleva un test
que fallaba antes del arreglo. `docs/36` es la segunda excepción a la congelación (DEC-205). La
especificación entra en el repositorio al cerrar (RV-483), con el resumen final de esta verificación.

## Backend

**RV-450 (DEC-206) · Unión de la cuenta de jefatura** (#710, migración `0048`). La unión de la cuenta
de jefatura exige una cuenta de una sola persona (`CUENTA_MEZCLADA`), cierra las demás sesiones (si
no puede, se deshace y responde 503) y `fn_es_admin` solo acepta un JWT posterior a la unión.
`fn_desvincular_administrador` (solo `service_role`) para la Function y para RV-463. Tests: vitest de
la Function y pgTAP 45 y 40, en rojo antes del arreglo.
- Suposición: un JWT sin `iat` no se compara con la fecha de la unión (solo lo omiten los claims
  montados a mano con acceso directo a la base de datos; los de Supabase Auth siempre lo llevan). Así
  siguen valiendo el seed de staging, `anonimizar` y `probar-restauracion` sin tocarlos.
- Tras la revisión del PR, `YA_VINCULADO` también cierra las demás sesiones, deshacer se reintenta una
  vez y `CUENTA_MEZCLADA` anota qué regla falla, sin datos de la cuenta.

**RV-451 (DEC-207) · Un intento frenado no cuesta un bcrypt** (#710). Un intento ya frenado no
compara el código (pgTAP 45: menos de 50 ms frente a más de 50 ms con bcrypt de coste 12, y el
`explain` de la lectura previa); el aviso técnico que falla no impide entrar y queda en
`errores_cliente`; la Function corta desde el undécimo intento por minuto e IP agrupada (vitest). En
rojo antes del arreglo.
- Desviación: el corte de la Function responde `503 OCUPADO` con `reintentar_en_s` y `Retry-After`,
  no `429 DEMASIADOS_INTENTOS`, para que la app (la actual y la anterior) no deje el móvil una hora
  sin entrar; las dos ya lo entienden como «prueba otra vez en un minuto».

**RV-452 (DEC-208) · Editar con versión, la parte de SQL** (#710). `fn_editar_punto` con `version`
responde `PUNTO_CAMBIADO` si el punto ha cambiado después; `datos_cambiados_en` llega al panel en
`v_puntos_activos` y no al móvil del voluntario (pgTAP 45, en rojo antes del arreglo).

## Ops

**RV-460 (matiz de DEC-198) · Sin código de dependencias con permiso de escritura** (#707).
`mantenimiento.yml` regenera en un trabajo de solo lectura y publica en otro sin Node, que copia solo
las rutas de una lista cerrada y rechaza cualquier otra; `canario-ubuntu.yml` prueba sin permiso de
escritura y abre su issue en un trabajo sin dependencias. Un test comprueba que ningún trabajo con
permiso de escritura ejecuta código de dependencias, y ya no hay excepciones de
`persist-credentials`. Ensayo de mantenimiento (38562436303) y canario (38562462964) en verde desde
la rama.

**RV-461 y RV-462 · Respaldo de staging y retraso de producción** (#706). Un respaldo de staging
cortado por tiempo también abre su issue y encola el aviso técnico, con el mismo tiempo que
producción (45 min); la vigilancia de staging avisa si su último respaldo tiene más de 8 días. El
retraso de producción cuenta `config/`, `datos/` y `CHANGELOG.md`, y no `workers/`. Tests en rojo
antes del arreglo (local y CI 38561519032).

**RV-463 (DEC-206) · La vigilancia revisa las uniones de jefatura** (#712, #715). La vigilancia
revisa a diario las uniones de jefatura de producción y de staging con la regla de RV-450, leyendo de
Supabase Auth solo los usuarios unidos, y desune la que no la cumple, con su problema y su aviso
técnico. Tests con usuarios simulados en rojo antes de la implementación.
- Primera revisión a mano, solo informando (38569874102): sin uniones en staging ni en producción;
  nada desunido.
- Desde #715 la vigilancia programada desune; lanzada a mano, por defecto solo informa. Se mantienen
  las salvaguardas: solo se da por borrado un usuario que Supabase Auth dice que no existe, y si no
  cumple ninguna de dos o más uniones no se desune ninguna. En producción no puede desunir hasta que
  0.14.0 lleve la migración `0048`. Test de `workflows.test.ts` en rojo antes del cambio.

## Frontend

**RV-470 · El código pegado o sugerido entra entero** (#705). El código de acceso que entra de golpe
en una casilla (portapapeles del teclado, sugerencia del sistema) se reparte entre las casillas y el
foco pasa al nombre. Lo insertado se toma del evento del navegador. e2e nuevo: 14 de 18 en rojo antes
y todos en verde después; vitest de la lógica de casillas.
- Desviaciones: hasta 18 caracteres en todas las casillas; un código entero va siempre desde la
  primera casilla; con cifras de sobra el foco no sale de las casillas.

**RV-472 · El Registro con palabras y en hora local** (#709). El Registro nombra las acciones de
abrir y cerrar la entrada, guardar un núcleo, restaurar un respaldo y separar a un administrador de
su cuenta de Google, y se pueden filtrar. El detalle nombra los campos de la entrada, del código y de
los móviles, dice el motivo con palabras y enseña las fechas en hora de Albolote. Un test saca las
acciones de las migraciones y falla si alguna no tiene nombre.
- Quedan con su clave las de Parámetros y las de una propuesta, fuera de este punto.

**RV-450 (panel) · El panel renueva la sesión al unir la cuenta** (#713). Tras unir la cuenta de
jefatura, el panel renueva la sesión antes de volver a comprobar; si no puede, lo dice y deja
reintentar sin cerrar la sesión. Una cuenta con otra identidad unida ve «No autorizado» con su
explicación. El resultado «unida» ya no se recuerda en la sesión. vitest (6 nuevos en rojo antes) y
e2e.

**RV-471 (DEC-208) · Editar no pisa el cambio de otro administrador** (#714). Editar manda la versión
del punto. Si otro administrador lo ha cambiado mientras se editaba, no se guarda: aviso en la
ventana y «Ver lo nuevo», que carga lo nuevo, conserva lo escrito en lo que el otro no tocó y marca
lo que sí. Guardar después lleva la versión nueva. e2e en rojo antes y en verde después; vitest de
la fusión.

## Cierre

**RV-480 · Decisiones y documentación** (este PR). DEC-205 a DEC-208 en 12, con los matices a
DEC-197, DEC-198, DEC-199 y DEC-202, y `docs/37` en DEC-193 y DEC-196; `CLAUDE.md` §5; 09 §8; 13
(volver a entrar una vez en los otros dispositivos tras unir la cuenta y qué quiere decir «Esta cuenta
tiene otra identidad unida»); 15 §4 (qué hacer si la vigilancia desune una cuenta). Solo
documentación.

Pendiente: RV-481 (RV-139b sobre el commit final de `develop`), RV-482 (recorrido corto) y RV-483
(0.14.0 y archivo de la especificación).

**RV-482 · Recorrido corto** (este PR). Con `revisar-pantallas`, en local sobre `develop` (`0785f96`),
con el servidor simulado de los e2e (el build de pruebas y las respuestas de `entrada-codigo-entero`,
`inventario-editar` y `acceso`), a 412 × 915 (Pixel 7) y 1440 × 900, en claro y en oscuro: 20
recorridos, todos en verde, y 36 capturas miradas una a una. Staging no hacía falta: lo simulado lo
cubre todo, y el código de staging no se teclea ni se ve. Solo documentación.

- **La entrada con el código pegado y con `insertText`:** ok. Seis cifras con `fill` en la primera
  casilla, con `insertText` en la primera y con `insertText` de lo que falta desde la tercera: las seis
  llenas y el foco en el nombre. Seis cifras con `fill` en la tercera también van desde la primera, con
  el foco en el nombre.
  [Captura](recorrido/2026-10-14/rv482-01-entrada-insertar-tercera-m412-oscuro.jpg).
- **Editar con `PUNTO_CAMBIADO`:** ok. El aviso sale arriba de la ventana con «Ver lo nuevo», y
  «Guardar cambios» espera con el aviso como motivo. «Ver lo nuevo» conserva lo escrito (estado y
  descripción) y marca el enganche y la dirección del otro con «Valor nuevo». Guardar de nuevo cierra la
  ventana con «Guardado». En oscuro, el aviso y las marcas con su tinte, sin cajas claras.
  [Captura](recorrido/2026-10-14/rv482-02-editar-ver-lo-nuevo-m412-claro.jpg).
- **El Registro con las acciones nuevas y las horas locales:** ok. «Entrada abierta para todos»,
  «Dispositivos revocados», «Código de acceso cambiado», «Entrada para todos cerrada», «Núcleo
  guardado» y «Administrador separado de su cuenta de Google», con su nombre en la tabla, en las
  tarjetas del móvil y en el filtro. Revocar desde una hora dice «Desde: 14 oct 2026 a las 00:00» (la
  hora de Albolote) y la entrada abierta, «Hasta: … a las 23:30 · Horas: 24 · Motivo: Código nuevo
  revocando los móviles». Ninguna clave cruda, ningún `+00:00` ni `T..:..` en la página.
  [Captura](recorrido/2026-10-14/rv482-03-registro-acciones-e1440-oscuro.jpg).
- **El panel tras unir la cuenta:** ok. Une, renueva la sesión y entra en la Cola de revisión.
  **`CUENTA_MEZCLADA`:** ok. «No autorizado» con su explicación y «Volver», sin «Reintentar».
  [Captura](recorrido/2026-10-14/rv482-04-cuenta-mezclada-m412-oscuro.jpg).

Ningún defecto alto ni medio. Bajos, de antes de `docs/36` y fuera de estos puntos:
- En las tarjetas del Registro en el móvil, una acción sin punto enseña «Punto —».
- A 412 px, los filtros de la Cola cortan su texto («todas las opera…», «todos los núcle…»).
- A 412 px, el aviso «Guardado …» del Inventario tapa el centro de la cabecera mientras se ve.

## Cierre (RV-483)

- **0.14.0 en producción** el 14 oct 2026 con `npm run publicar` y la puerta automática (CI de `main`, RV-139b en verde con `0785f96` y después solo documentación y versión, `comprobar-produccion --completo`, ninguna `bloquea-release`); producción sirve `0.14.0` y el commit `df3d4bf`. Fila en `paridad-produccion.md`.
- **La especificación** pasa a `archivo/especificaciones/36-revision-tras-35.md` y sale de `.git/info/exclude`.
- **Para después del piloto** (issues `tras-piloto`): #708, #720, #721, #722, #723, #724. Los hallazgos bajos de la revisión del 14 oct no están en la especificación: los anota el desarrollador como issues `tras-piloto` si quiere conservarlos.
- **Desde 0.14.0** la vigilancia de producción puede desunir (lleva `0048`).
