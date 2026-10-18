# Registro de `docs/41` · Antes del piloto: los límites de las fotos, `rpc()` y los huecos de las pruebas

Una línea por PR: qué entró, el test que falló antes (o «sin test: documentación») y el número del PR.

- **RV-538:** puesta en marcha. 12 v1.75 (DEC-228 a DEC-230, sus filas del índice y `docs/42` en DEC-193, DEC-196,
  DEC-205, DEC-209, DEC-212, DEC-216 y DEC-224); CLAUDE.md §5 (`docs/41` como excepción abierta, `docs/42` la de
  después del piloto) y §6 (`npm test -- --coverage`); skill `paquete-rv`; 09 §8 (en curso, con este registro, y el
  piloto empieza con `docs/41` cerrada); `docs/41-antes-del-piloto-pruebas.md` entra en Git; issues de los once
  puntos (#908 a #918) y #847 fuera de `tras-piloto`, que la cierra RV-546. Sin test: documentación. (#920)
- **RV-539:** `rpc()` no devuelve un 500 por un 2xx ilegible. `r.text()` y el `JSON.parse` del camino bueno, dentro de
  un `try`; un 200 que no es JSON o un cuerpo cortado salen como `SERVIDOR_NO_DISPONIBLE` con 503, igual que un fallo
  de red (comentario con por qué no duplica escrituras: FR-49). `vincular-jefatura.ts`, sin los dos `try` que lo
  esquivaban; su contrato pasa de 500 a 503 en ese caso. Tests que fallaban antes: «un 200 que no es JSON es «sin
  servidor», no una excepción» y «un 200 cuyo cuerpo se corta a mitad también» (`functions/_lib/comun.test.ts`), más
  «una respuesta ilegible de la base es 503, no un 500 genérico» (`functions/api/url-subida.test.ts`), que prueba la
  Function entera; el de `vincular-jefatura.test.ts` que esperaba 500 pasa a esperar 503. 05 v1.10 (§9 y el contrato
  de `vincular-jefatura`).
