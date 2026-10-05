-- 0037 · Enganche "Directo" (docs/29 RV-120, DEC-170, FR-20).
--
-- Solo el valor nuevo del enum, en su propio archivo, como 0033 con "barro": un valor añadido con
-- alter type ... add value no se puede usar en la misma transacción en que se añade, y migrar.ts
-- aplica cada archivo en su transacción. Va delante de 'otro'; el orden en pantalla (Barcelona ·
-- Granada · Directo · Otro) lo decide el frontend, no el orden del enum.
-- Ninguna función ni vista enumera los valores de tipo_racor: todas usan el cast al enum, así que
-- 'directo' ya entra en el alta, la corrección, la fusión y fn_editar_punto. puntos_racor_solo_boca
-- sigue impidiéndolo en un hidrante.

alter type hidrantes.tipo_racor add value if not exists 'directo' before 'otro';
