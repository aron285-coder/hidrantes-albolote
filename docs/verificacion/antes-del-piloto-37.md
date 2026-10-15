# Verificación · `docs/37` (antes del piloto)

Registro de lo que ha entrado de `docs/37`, PR a PR: qué cambia y cómo se ha comprobado. Cada punto con
código lleva un test que fallaba antes del arreglo. `docs/37` cabe en la congelación (DEC-209): dos
arreglos `bloquea-release`, dos arreglos pequeños y la documentación del piloto. Una sola sesión, en el
orden de §0.2.

| Punto | Issue | Etiqueta |
|---|---|---|
| RV-490 · comprobar `dist` antes de desplegar (DEC-210) | #726 | `bloquea-release` |
| RV-491 · la entrada del lanzamiento desde una wifi (DEC-211) | #727 | `bloquea-release` |
| RV-492 · Editar exige la misma versión | #728 | — |
| RV-493 · `OTRA_CUENTA` en el panel | #729 | — |
| RV-494 · casos de aceptación en 10 | #730 | — |
| RV-495 · límites y números en 03, 05 y 11 | #731 | — |
| RV-496 · manuales 13 y 14 | #732 | — |
| RV-497 · el resto de la documentación | #733 | — |
| RV-498 · los bajos, como issues `tras-piloto` | #734 | — |
| RV-499 · cierre y 0.15.0 | #735 | — |

## RV-489 · Puesta en marcha

La especificación entra en `docs/` (DEC-195). DEC-209 a DEC-211 en 12; donde DEC-193, DEC-196 y DEC-205
decían `docs/37` como la de después del piloto, ahora dicen `docs/38` (también CLAUDE.md §5 y 09 §8). Una
issue por punto; RV-490 y RV-491 con `bloquea-release`.

## RV-490 (DEC-210) · `dist` comprobado antes de desplegar

#737. `.github/scripts/comprobar-dist.sh` en `desplegar` de los dos `deploy-*.yml`, en el paso siguiente a la
descarga de `dist` y antes de cualquier paso con secretos: sin `_worker.js` (archivo o carpeta), `functions/`,
`_routes.json`, `_redirects` ni otro nombre de la raíz con `_` salvo `_headers`; sin enlaces simbólicos; solo
extensiones de una lista cerrada (la de un `dist` de hoy); y `_headers` idéntico al que genera
`config/cabeceras.ts` con las mismas variables públicas que `construir` (`scripts/cabeceras-esperadas.ts`, con
`node`). Tras desplegar, `comprobar-despliegue.ts` exige que `POST /api/verificar-codigo` con `{}` dé
exactamente `400 {"error":"PAYLOAD_INVALIDO"}` en JSON. Tests: `scripts/workflows.test.ts` (cada caso del guion
y el orden de los pasos) y `scripts/comprobar-despliegue.test.ts`; 19 en rojo antes. 04 §11.2 y 11 §9.
- Suposición: además de los cuatro nombres de la especificación, se rechaza cualquier otro nombre de la raíz que
  empiece por `_` (Pages los reserva). La lista de extensiones incluye `.map`, `.pbf` y `.woff`, que también
  salen en un `dist` limpio.

## RV-491 y RV-492 · Migración `0049`

#738. Una sola migración, como pide la especificación, en un PR propio antes del código de RV-491:
`grant execute on fn_entrada_abierta_hasta() to service_role` (solo a ese rol) y `fn_editar_punto` con
`is distinct from` en vez de `>` (al milisegundo, misma firma). pgTAP `46`, en rojo antes. La Cola
(`fn_aplicar_propuesta`) compara `datos_cambiados_en > creada_en` de la **propuesta**: es otra pregunta
(¿cambió el punto después de proponer?) y se queda como está.
- Desviación de orden: RV-492 entró con la migración, antes que el código de RV-491, para que `0049` fuera una.

## RV-491 (DEC-211) · La entrada del lanzamiento desde una wifi

#739. La Function pregunta si la entrada está abierta solo cuando una IP agrupada pasa de 10 intentos por
minuto, como mucho una vez por minuto y por aislado (las peticiones simultáneas esperan la misma respuesta);
abierta, deja 60. Si la pregunta falla, 10, sin volver a preguntar ese minuto. La app, con `OCUPADO`, espera
`reintentar_en_s` más 0–10 s al azar y lo intenta sola hasta tres veces, con la cuenta atrás y Cancelar;
cambiar el código o el nombre la cancela; Entrar no se pulsa mientras espera (el motivo es la cuenta atrás). Un
aviso fijo para lectores de pantalla, una vez por espera (la cuenta atrás no se anuncia cada segundo). Tests:
vitest de la Function (5 en rojo antes), `esperaOcupado`, `verificarCodigo`, y e2e de reintento, tres
`OCUPADO`, Cancelar y cambio de nombre. 03 TR-41, 06 Apéndice A, 13 §2, 14 §2.
- Interpretación: «como mucho tres veces seguidas» son tres reintentos solos después del intento a mano (cuatro
  peticiones); si el tercero también da `OCUPADO`, el texto de siempre.

## RV-493 · `OTRA_CUENTA`

#740. El panel distingue `403 OTRA_CUENTA` de un desconocido: «Este correo de jefatura ya está unido a otra
cuenta de Google. Entra con esa, o pide a otro administrador que te quite y te devuelva el acceso.» El cierre
de sesión es el de siempre. Tests: vitest de `acceso.ts` (`OTRA_CUENTA` a su texto; `NO_ES_ADMINISTRADOR` y
los demás al de siempre) y e2e. 06 Apéndice A, 13 §2 y 15 §5.5.

## RV-494 a RV-497 · Documentación del piloto

- **RV-494** (#772): 10 v1.7, AC-102 con la casilla sin marcar y los casos AC-172 a AC-178.
- **RV-497** (#773): 01 FR-164 y 02 FL-34 con los avisos técnicos; `entornos.md` con `PROPIETARIO` y las
  variables del mapa base; 12 con el índice por documento hasta DEC-211 y sin números que caducan; el registro
  de `docs/36` al día; las capturas del 22 de septiembre, borradas con su `LEEME.md` (nadie más las enlazaba).

## RV-498 · Los bajos, como issues `tras-piloto`

Una issue por línea de §7, con título neutro y la etiqueta `tras-piloto`. No se implementan (DEC-193).

1. #741 · Campo · el aviso de versión deja hueco para el indicador de inicio del iPhone
2. #742 · Campo · anillo de foco visible sobre el botón marino del aviso de versión en claro
3. #743 · Campo · el tope de móviles nuevos no debería decir «mañana» si se puede antes
4. #744 · Campo · un 4xx al subir una foto no debería contar como servidor caído
5. #745 · Campo · tiempo máximo al abrir IndexedDB
6. #746 · Campo · detectar el mapa sin conexión borrado por el sistema durante la sesión
7. #747 · Campo · Mis propuestas con el acceso revocado debería llevar a la entrada
8. #748 · Campo · que dos ventanas no procesen la misma cola
9. #749 · Campo · un mensaje largo pegado en la entrada no debería perder cifras
10. #750 · Panel · «revocar desde» acepta la fecha más antigua que ofrece
11. #751 · Panel · Salud se recarga tras revocar
12. #752 · Panel · la ventana de cambiar el código no se cierra mientras guarda
13. #753 · Panel · «Añadir» administrador deshabilitado con su motivo escrito
14. #754 · Panel · zonas de toque de al menos 44 px
15. #755 · Panel · tras «Ver lo nuevo», lo escrito en un campo oculto se ve
16. #756 · Panel · tras «Ver lo nuevo», se puede recuperar la posición propia del pin
17. #757 · Panel · los dos «Ver lo nuevo» de Editar hacen lo mismo
18. #758 · Panel · el Registro con palabras también en workflow_lanzado, exportacion y anonimizacion
19. #759 · Panel · «Se revocarán N móviles» cuenta móviles y no tokens
20. #760 · Servidor · dos primeras entradas de jefatura a la vez no deshacen una unión buena
21. #761 · Servidor · cerrar las demás sesiones a la vez que se une la cuenta de jefatura
22. #762 · Servidor · los intentos frenados no bloquean la fila de avisos técnicos
23. #763 · Servidor · los avisos técnicos solo a administradores unidos
24. #764 · Servidor · IPv6 por /48 también en el tope de altas por wifi
25. #765 · Servidor · la mitad para móviles nuevos sin poder saltarla esperando 24 h
26. #766 · CI · el seed de staging con psql en modo breve
27. #767 · CI · la URL de producción de las tareas con la service role, fija en el repositorio
28. #768 · CI · «desunida» no se pierde si el paso se corta por tiempo
29. #769 · CI · timeout-minutes y concurrency en todos los trabajos
30. #770 · CI · búsqueda exacta de issues por título y cierre del aviso del respaldo de staging
