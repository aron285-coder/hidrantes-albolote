# Verificación · Pantallas de campo más simples, "Barro", 70 mm en bocas, dos fotos y fotos del racor (docs/24)

**Estado: hecho el 4 oct 2026, en staging y en producción (0.7.0).** Los esquemas provisionales de los racores (#435, DEC-152) llegan a producción con la siguiente versión.
Especificación: `docs/24-campo-mas-simple.md`. Tres sesiones en paralelo, coordinadas en #409. Los
registros de cada sesión son `campo-backend.md`, `campo-frontend.md` y `campo-ops.md`.

## 1. Qué se ha hecho

| Punto | Backend · migración | Frontend | Qué |
|---|---|---|---|
| RV-99 | — | #420 | Menos texto en las pantallas de campo; las definiciones de Malo y No funciona pasan al primer uso (FR-94) y a la sesión presencial |
| RV-100 | — | #420 | «Añadir un punto aquí» primero y en naranja. Como mucho un primario por pantalla (DEC-147) |
| RV-104 | — | #423 | Foto de referencia en Granada y Barcelona, con `scripts/preparar-racores.ts`. Sin las fotos, el botón se ve como antes |
| RV-102a | — | #415 | Un estado que la app no conoce se dibuja como No funciona y la ficha dice «actualiza la aplicación». Fusionado **antes** que 0034 |
| RV-101 | #416 · `0032` | #426 | Bocas de 45, 70 u otra medida, que se aprueba tal cual (DEC-144, DEC-148) |
| RV-102 | #419 · `0033`, `0034` | #428 | Estado «Barro», marrón y tachado. No sale en Cercanos y entra en el filtro «No utilizable» (DEC-145, DEC-149) |
| RV-103 | #421 · `0035` | #430 | Foto del sitio obligatoria en alta y en corregir ubicación. Hay firma nueva de `fn_proponer` y la de antes se queda. La purga la protege (DEC-146, DEC-150) |

- **Decisiones:**
  - Backend: DEC-144 a DEC-146.
  - Frontend: DEC-147 a DEC-150.
  - Ops: DEC-151, la purga tras el primer ensayo, que salió al revisar #405.
- **Migraciones:** 0032 a 0035, con pgTAP 29 a 31 (32, 15 y 36 casos). `npm run compatibilidad` en verde en los tres PR de Backend.
- **Requisitos:** `docs/01` v1.6 (Backend) y v1.7 (Frontend), con conformidad del desarrollador del 3-10 y de jefatura, recogida por el desarrollador el 4-10.

## 2. Lo que la especificación no esperaba

- **El marrón propuesto no se distingue de Malo con protanopía** (ΔE2000 1,1). Queda `--marron-600 #806460`, con ΔE2000 ≥ 15 frente a Regular y Malo con visión normal, protanopía y deuteranopía, y 3:1 sobre el mapa claro. Lo mide `accesibilidad.test.ts` (DEC-149).
- **Dos averías de antes, arregladas en 0032:**
  - una boca volvía a 45 mm en su siguiente revisión;
  - un alta aprobada sin correcciones perdía su `punto_id`, así que «Mis propuestas» no enseñaba el código y `promover-piloto.ts` no la copiaba. 0032 rellena las altas antiguas desde `registro`.
- **La exportación no tenía columna de foto.** Ahora trae «Foto» y «Foto del sitio».
- **La purga de fotos repetía el ensayo cada lunes:** DEC-151, #413, en `campo-ops.md`.

## 3. Checklist de docs/24 §4

- [x] **RV-99:** ninguno de los textos de la tabla aparece (`textos.test.ts`). Hay capturas antes y después en `ci-vistas`.
- [x] **RV-100:** «Añadir un punto aquí» arriba y en naranja, y como mucho un primario por hoja.
- [x] **RV-104:** Granada y Barcelona llevan imagen, por ahora un esquema provisional (DEC-152), y el e2e sin cobertura ya corre. Queda sustituirlas por fotos propias (§4).
- [x] **RV-101:** pgTAP con altas de 45, 70 y 32 aprobadas; la app anterior sigue dando 45 (`compatibilidad`).
- [x] **RV-102a, antes que 0034,** y RV-102 con «Barro» marrón y tachado, fuera de Cercanos y en «No utilizable». En producción las dos van en la misma release (`campo-ops.md` §3).
- [x] **RV-103:** alta y ubicación piden las dos fotos, y la ficha y el panel las enseñan. La purga no toca las fotos del sitio (pgTAP). La cola vieja no pierde nada (`cola-foto-sitio.test.ts`).
- [x] **Documentos:** `docs/01` en versión nueva; 05, 06 y 04 al día.
- [x] **P-14:** producción en la **0.7.0** el 4 oct 2026 a las 06:36 UTC (#434, run 37155680542), con 0032 a 0035 en orden y la paridad en verde. La purga en ensayo (run 37183337683) no propone borrar nada.
  - RV-102a va en la misma release que 0034, como permite `docs/24` §0: «barro» solo aparece en datos aprobados después del despliegue. `npm run compatibilidad` pasó en `ci-sql` en los tres PR de Backend.
  - El aviso de 0035 sobre el tope de subidas no sale en el log de `deploy-prod`, porque `migrar.ts` corre `psql` en silencio. El valor se ve en Ajustes → Parámetros del panel: 80 si seguía en el de fábrica.
  - Las imágenes de los racores aún no estaban en esta release.

## 4. Lo que queda para personas (docs/24 §5)

1. ~~Fotos de los racores~~ **Cerrado (DEC-178):** los dibujos son la referencia definitiva; no se esperan fotos.
   - Se preparan con `npx tsx scripts/preparar-racores.ts <carpeta>`, en un PR aparte.
2. ~~Conformidad de jefatura~~ **Hecho:** recogida por el desarrollador el 4-10 y anotada en `docs/01` v1.6 y v1.7.
3. **Sesión presencial (F9.9, #84):** Malo, Barro y No funciona con una frase cada uno. El guion está en `docs/02`.
4. **P-14:** las dos aprobaciones de producción.

Seguimiento sin prisa: #432, un código de error propio para la foto del sitio no reservada.
