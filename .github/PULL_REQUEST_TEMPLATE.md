Cierra #

## Qué cambia

<!-- Dos o tres líneas. Qué documento lo pide (FR-nn, TR-nn, FL-nn, AC-nn). -->

## Cómo lo he comprobado

<!-- Tests añadidos, comandos, capturas si cambia algo visible. -->

## Dependencias nuevas

<!-- Una línea por dependencia con el porqué (CLAUDE.md §3). "Ninguna" si no hay. -->

## Definición de terminado (09 §6)

- [ ] La issue enlazada tiene todos sus criterios de aceptación marcados.
- [ ] Tests: unitarios y pgTAP para lo tocado; e2e si cambia un flujo de 02.
- [ ] CI verde (typecheck, lint, build, presupuesto, tests, Lighthouse en staging).
- [ ] Ningún requisito nuevo inventado: todo lo que hace el código está en 01 o en 12.
- [ ] Cambios de esquema compatibles hacia atrás (04 §12) y reflejados en 05.
- [ ] Una tabla nueva de `hidrantes` lleva en su migración los `grant` que le da 05 §5 (Supabase no los concede solo, 04 §5).
- [ ] Textos de UI en español, sin jerga técnica, con los términos de 00 §6.
- [ ] Sin secretos, sin `console.log` de datos personales, sin dependencias nuevas sin motivo escrito.
- [ ] Reglas de interfaz de 06 §9 cumplidas en lo tocado: ningún control muerto, motivo en los botones
      deshabilitados, estado vacío en las listas, notación canónica, separación de acciones destructivas,
      objetivos táctiles.
- [ ] Textos nuevos añadidos a `src/lib/textos.ts` **y** al Apéndice A de 06 en este mismo PR.
- [ ] Escrituras con bloqueo por fila y tests de concurrencia si toca una RPC de escritura (05 §11).
- [ ] Registro de avance (09 §8) actualizado si cierra una fase, con `docs/verificacion/fase-N.md` (09 §7).
- [ ] Nada de nombres de voluntarios ni correos en este PR ni en la issue: el repositorio es público (DEC-053).
