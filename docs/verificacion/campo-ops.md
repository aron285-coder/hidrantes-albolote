# Verificación · Pantallas de campo más simples (docs/24) · sesión Ops

**Estado:** ver §3 (P-14). Especificación: `docs/24-campo-mas-simple.md`. Coordinación: #409.

## 1. Lo pendiente de docs/22 P-12 y docs/23 P-13, comprobado el 3-10

- **Respaldo del domingo 27-09:** ejecución programada `schedule` de `respaldo.yml` (run 36309250205, 27-09 a las 09:24 UTC), **en verde**.
- **Primera purga programada, lunes 28-09** (run 36414479358): hizo **ensayo**, como manda DEC-129, y abrió #405. La lista estaba bien: 0 fotos en el bucket y 0 referenciadas.
- **Vigilancia:** dos pasadas al día, todas en verde (la última, el 3-10 a las 12:43 UTC).
- **Canario de Ubuntu 26:** en verde el 25-09 y el 30-09. Si el del 7-10 y el del 14-10 también salen en verde, se cumplen las dos semanas de DEC-128 y se puede preparar el paso a `ubuntu-26.04` en un PR aparte.

## 2. Una avería de DEC-129 encontrada al revisar #405 (DEC-151, #413)

«Primera vez» solo se medía por `ultima_purga_fotos`, que escribe una pasada que **borra**. Sin ella, cada lunes volvía a ser la primera vez: el 5-10 habría vuelto a ser ensayo, y así para siempre, contra lo que prometían #405 y DEC-129.

- Ahora el ensayo de la primera programada escribe `config.primera_purga_ensayada`, y la siguiente programada borra.
- `probar-purga.ts` lo prueba en `ci-sql`: «segunda programada, tras el ensayo de la primera → borra».
- **En producción:** el ensayo del 28-09 se hizo con el código anterior. El 5-10 será ensayo una vez más y dejará la marca; el 12-10 ya borra. Con el bucket vacío no cambia nada (comentado en #405).

## 3. P-14

Producción en la **0.7.0** el 4 oct 2026 a las 06:36 UTC (#434, run 37155680542), con la aprobación del desarrollador y la paridad en verde. Los detalles están en `campo.md` §3 y en `paridad-produccion.md`.

## 4. Decisiones del desarrollador del 4-10

- **Racores:** aún no hay fotos. Hay esquemas provisionales (#435, DEC-152).
- **Conformidad de jefatura** sobre `docs/24`: sí, anotada en `docs/01`.
- **Sesión presencial (#84):** más adelante.
- **GitHub App de release-please:** no se hace (DEC-153). #396 cerrada y #406 cerrado sin fusionar.
