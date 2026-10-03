-- 0033 · Estado "barro": sale agua con barro (docs/24 RV-102, DEC-145, FR-18).
--
-- Solo el valor nuevo del enum, en su propio archivo: un valor añadido con alter type ... add value
-- no se puede usar en la misma transacción en que se añade, y migrar.ts aplica cada archivo en su
-- transacción (begin/commit por archivo, scripts/migrar.ts aplicar()). Lo usa 0034.
-- Va detrás de no_funciona: el orden del enum no cambia para los valores que ya existen.

alter type hidrantes.estado_caudal add value if not exists 'barro' after 'no_funciona';
