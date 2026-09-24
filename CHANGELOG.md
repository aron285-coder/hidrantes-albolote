# Changelog

## [0.6.3](https://github.com/aron285-coder/hidrantes-albolote/compare/hidrantes-albolote-v0.6.2...hidrantes-albolote-v0.6.3) (2026-09-24)


### Correcciones

* **ajustes:** las novedades se leen sin códigos internos ni palabras técnicas ([#338](https://github.com/aron285-coder/hidrantes-albolote/issues/338)) ([1b42d90](https://github.com/aron285-coder/hidrantes-albolote/commit/1b42d90bb5f360fbffc4caa24d204360106cb763)), closes [#337](https://github.com/aron285-coder/hidrantes-albolote/issues/337)
* **mapa:** con cobertura, el mapa enseña las calles aunque aún no hayas descargado el mapa base ([#341](https://github.com/aron285-coder/hidrantes-albolote/issues/341)) ([02447aa](https://github.com/aron285-coder/hidrantes-albolote/commit/02447aa951eac5ea0ee40fdf3026df80bc2bebe5))
* **mapa:** con el inventario vacío, el mapa lo dice y ofrece añadir el primer punto ([#346](https://github.com/aron285-coder/hidrantes-albolote/issues/346)) ([0f37051](https://github.com/aron285-coder/hidrantes-albolote/commit/0f3705135392a830fb002843fa3d4351f1dc2673))
* **rendimiento:** al abrir la app con sesión, el mapa sale unas décimas antes ([#348](https://github.com/aron285-coder/hidrantes-albolote/issues/348)) ([223d95a](https://github.com/aron285-coder/hidrantes-albolote/commit/223d95a907067dc52862ca7293c858beb3133435))
* **rendimiento:** la pantalla de entrada abre antes y el mapa base se descarga al entrar ([#327](https://github.com/aron285-coder/hidrantes-albolote/issues/327)) ([2dcaf81](https://github.com/aron285-coder/hidrantes-albolote/commit/2dcaf8110742cfe6e2f900e02d2647516dfcbb19))
* **vigilancia:** staging se mira en su propio trabajo y la vigilancia no se corta con un SIGPIPE (RV-78) ([#343](https://github.com/aron285-coder/hidrantes-albolote/issues/343)) ([7675e86](https://github.com/aron285-coder/hidrantes-albolote/commit/7675e86e27472b0b501b656f053a898c919e2cb3))

## [0.6.2](https://github.com/aron285-coder/hidrantes-albolote/compare/hidrantes-albolote-v0.6.1...hidrantes-albolote-v0.6.2) (2026-09-24)


### Correcciones

* **produccion:** el permiso de Workers del token se avisa sin impedir el PR a producción ([#321](https://github.com/aron285-coder/hidrantes-albolote/issues/321)) ([5d85eab](https://github.com/aron285-coder/hidrantes-albolote/commit/5d85eab20ff24a9255656d552e91bd8f738334db))
* **produccion:** la comprobación de paridad espera a que las Functions nuevas lleguen ([#324](https://github.com/aron285-coder/hidrantes-albolote/issues/324)) ([31ea8b9](https://github.com/aron285-coder/hidrantes-albolote/commit/31ea8b93172917a4d436271036661f0a41885c95))

## [0.6.1](https://github.com/aron285-coder/hidrantes-albolote/compare/hidrantes-albolote-v0.6.0...hidrantes-albolote-v0.6.1) (2026-09-24)


### Correcciones

* **avisos:** cinco defensas pequeñas: mapa base, avisos, purga de fotos, novedades y Auth ([#316](https://github.com/aron285-coder/hidrantes-albolote/issues/316)) ([958e547](https://github.com/aron285-coder/hidrantes-albolote/commit/958e54790f6310e9bf1e3e4c6387d8c47f6132db))
* **avisos:** comprobar que el token de Cloudflare puede desplegar el Worker, no solo verlo ([#312](https://github.com/aron285-coder/hidrantes-albolote/issues/312)) ([6d8cd74](https://github.com/aron285-coder/hidrantes-albolote/commit/6d8cd74b6964bc569b93fe2053b04af713b9600e))
* **busqueda:** la búsqueda entiende más formas de escribir coordenadas ([#315](https://github.com/aron285-coder/hidrantes-albolote/issues/315)) ([9044cfc](https://github.com/aron285-coder/hidrantes-albolote/commit/9044cfcae647e193f86b9a293fd77feb5d8c4d57))
* **busqueda:** los números de portal no fallan por un resultado roto y dicen cuándo hay que volver a entrar ([#309](https://github.com/aron285-coder/hidrantes-albolote/issues/309)) ([3cfcb20](https://github.com/aron285-coder/hidrantes-albolote/commit/3cfcb2003f4b05ceb183dbf9c35ba1022978b05b))
* **mapa:** "Cercanos" ya no deja cabos sueltos al volver atrás, en la lista ni en los tramos de jefatura ([#311](https://github.com/aron285-coder/hidrantes-albolote/issues/311)) ([50642ad](https://github.com/aron285-coder/hidrantes-albolote/commit/50642ad1b4c9196e4bebc4ac6cab386aec10aafd))
* **mapa:** en el móvil, "Cercanos" enseña tres puntos sin desplazarse ([#314](https://github.com/aron285-coder/hidrantes-albolote/issues/314)) ([03fa85d](https://github.com/aron285-coder/hidrantes-albolote/commit/03fa85df198785d8c63bd558f7e125b7a6fdf13f))
* **mapa:** en tableta y ordenador, "Cercanos" ya no tapa la ficha ni los puntos del incidente ([#319](https://github.com/aron285-coder/hidrantes-albolote/issues/319)) ([d16120f](https://github.com/aron285-coder/hidrantes-albolote/commit/d16120f8595b46272b520c09fdb8e0f49db8470d))
* **mapa:** la distancia de cada tramo al medir se lee bien, al lado de la línea ([#318](https://github.com/aron285-coder/hidrantes-albolote/issues/318)) ([bd8f4ee](https://github.com/aron285-coder/hidrantes-albolote/commit/bd8f4ee298df3104e141cb45e099cd8c91f25949))

## [0.6.0](https://github.com/aron285-coder/hidrantes-albolote/compare/hidrantes-albolote-v0.5.0...hidrantes-albolote-v0.6.0) (2026-09-24)


### Novedades

* **avisos:** avisos cada 5 minutos desde un Worker de Cloudflare (RV-52) ([#295](https://github.com/aron285-coder/hidrantes-albolote/issues/295)) ([bdf3eee](https://github.com/aron285-coder/hidrantes-albolote/commit/bdf3eee06e0853332c8611a6dfd1b0ea49ff739f))


### Correcciones

* **acceso:** jefatura ya no pierde el incidente, la ficha ni ¿Qué hay aquí? al recargar la página ([#301](https://github.com/aron285-coder/hidrantes-albolote/issues/301)) ([e6cf324](https://github.com/aron285-coder/hidrantes-albolote/commit/e6cf3241f4d35fe611f4cc2245b64feda830e55a))
* **avisos:** token de Cloudflare solo de Pages sin tirar el despliegue de staging (RV-52) ([#305](https://github.com/aron285-coder/hidrantes-albolote/issues/305)) ([d5e68d4](https://github.com/aron285-coder/hidrantes-albolote/commit/d5e68d4fd0ebda5c038f653fd3d94681b36a1fe6))
* **incidente:** "Cercanos" ordena siempre igual y nunca pone primero uno más lejano ([#298](https://github.com/aron285-coder/hidrantes-albolote/issues/298)) ([c3151cc](https://github.com/aron285-coder/hidrantes-albolote/commit/c3151cce36edc01f239dac86ab9cbdd4b0228b4f))
* **mapa:** "Cercanos" dice cuánto de precisa y de reciente es tu posición, y espera al GPS ([#304](https://github.com/aron285-coder/hidrantes-albolote/issues/304)) ([a5d3467](https://github.com/aron285-coder/hidrantes-albolote/commit/a5d3467b28ec6b309c97bfda300e6da2953a0d3c))
* **mapa:** sin cobertura, el mapa base propio debajo de la capa en línea (RV-58) ([#302](https://github.com/aron285-coder/hidrantes-albolote/issues/302)) ([259f251](https://github.com/aron285-coder/hidrantes-albolote/commit/259f2514cdeb9a3ed2d4a281323cdbb6800bbcfd))
* **panel:** lectura completa de jefatura por páginas por clave (RV-65) ([#303](https://github.com/aron285-coder/hidrantes-albolote/issues/303)) ([2ca650e](https://github.com/aron285-coder/hidrantes-albolote/commit/2ca650ef3d26141f7a3a1ee472924511f8887e22))
* **piloto:** la promoción del piloto no vuelve a dar códigos de puntos retirados ([#307](https://github.com/aron285-coder/hidrantes-albolote/issues/307)) ([2c95522](https://github.com/aron285-coder/hidrantes-albolote/commit/2c955223500e24b66137ac222d5d31d0e4975b76))
* **privacidad:** un error de psql en Actions no enseña la fila con los nombres ([#297](https://github.com/aron285-coder/hidrantes-albolote/issues/297)) ([73f7047](https://github.com/aron285-coder/hidrantes-albolote/commit/73f7047334f3d699268c788f7881275466e51313))
* **restauracion:** el acceso y las secuencias se reponen en la misma transacción que el volcado ([#299](https://github.com/aron285-coder/hidrantes-albolote/issues/299)) ([a9f6d18](https://github.com/aron285-coder/hidrantes-albolote/commit/a9f6d1843218d9c6376f8de181f98b0186d709a6))
* **restaurar:** restaurar se para antes de tocar nada si psql es demasiado antiguo ([#308](https://github.com/aron285-coder/hidrantes-albolote/issues/308)) ([d765ca7](https://github.com/aron285-coder/hidrantes-albolote/commit/d765ca763712fdc357834cddd721e52307b7f8a9))
* **vigilancia:** solo cerrar con HAY=no, sin npm ci y con las tareas de pg_cron esperadas (RV-56) ([#306](https://github.com/aron285-coder/hidrantes-albolote/issues/306)) ([eb91f24](https://github.com/aron285-coder/hidrantes-albolote/commit/eb91f24b6f30e7571bef08ea7b5aa4ed38e11a50))

## [0.5.0](https://github.com/aron285-coder/hidrantes-albolote/compare/hidrantes-albolote-v0.4.0...hidrantes-albolote-v0.5.0) (2026-09-24)


### Novedades

* **ajustes:** las novedades de la versión salen del build y se ven en la app y en el panel ([#208](https://github.com/aron285-coder/hidrantes-albolote/issues/208)) ([f48a49e](https://github.com/aron285-coder/hidrantes-albolote/commit/f48a49ec0f4ea5cbb04f248a5d5d28c5b410a05d))
* **busqueda:** calles, lugares, direcciones y coordenadas (GM-04) ([#266](https://github.com/aron285-coder/hidrantes-albolote/issues/266)) ([632f609](https://github.com/aron285-coder/hidrantes-albolote/commit/632f609a887b68c107326ed21dab18203ff785a6))
* **incidente:** los cinco puntos más cercanos que funcionan (GM-03) ([#264](https://github.com/aron285-coder/hidrantes-albolote/issues/264)) ([a33dc2c](https://github.com/aron285-coder/hidrantes-albolote/commit/a33dc2c8d972fca6574b1e226dae8555c67f663b))
* **mapa:** mantener pulsado el mapa abre "¿Qué hay aquí?", y la ficha enseña las coordenadas y se puede compartir ([#263](https://github.com/aron285-coder/hidrantes-albolote/issues/263)) ([3d694e8](https://github.com/aron285-coder/hidrantes-albolote/commit/3d694e8c9ba71409b5c667200d1a8cd4a61165d3))
* **medir:** coordenadas UTM, geometría y el tramo de manguera en Ajustes ([#262](https://github.com/aron285-coder/hidrantes-albolote/issues/262)) ([3bf7679](https://github.com/aron285-coder/hidrantes-albolote/commit/3bf7679cc77975948f48dc39e4a374c43576c11e))
* **medir:** medir un tendido y los tramos de manguera (GM-06) ([#265](https://github.com/aron285-coder/hidrantes-albolote/issues/265)) ([815422d](https://github.com/aron285-coder/hidrantes-albolote/commit/815422d9a1b4663ad00528ad3be81613e94574ce))
* **produccion:** comprobar sin cambiar nada que producción tiene lo que la versión necesita ([#293](https://github.com/aron285-coder/hidrantes-albolote/issues/293)) ([f861865](https://github.com/aron285-coder/hidrantes-albolote/commit/f8618651951bdb621c142fbe549ab9f6f6b9d48b))
* **produccion:** paridad de producción con develop tras cada despliegue (P-03) ([#294](https://github.com/aron285-coder/hidrantes-albolote/issues/294)) ([5276319](https://github.com/aron285-coder/hidrantes-albolote/commit/52763197a09449b2a1bd7850abb62905dcb62567))


### Correcciones

* **ajustes:** las novedades que ve el voluntario solo hablan de lo que cambia para él ([#258](https://github.com/aron285-coder/hidrantes-albolote/issues/258)) ([1205f18](https://github.com/aron285-coder/hidrantes-albolote/commit/1205f183fc0c1674a69be00d9628a138a049c96f))
* **alta:** una posición GPS que no está al día no coloca el pin ni viaja como gps ([#250](https://github.com/aron285-coder/hidrantes-albolote/issues/250)) ([723e76f](https://github.com/aron285-coder/hidrantes-albolote/commit/723e76fe45d42d23536c90919d652e66d94fb65f))
* **avisos:** los avisos push salen solos cada 15 minutos y no se pierden en lotes grandes ([#197](https://github.com/aron285-coder/hidrantes-albolote/issues/197)) ([1ef8806](https://github.com/aron285-coder/hidrantes-albolote/commit/1ef88064da403e777d6ba1e0c66d12e9e7dac4f5))
* **codigo:** límite por /64, cuenta bajo bloqueo y tope de canjes buenos ([#203](https://github.com/aron285-coder/hidrantes-albolote/issues/203)) ([bf90a6e](https://github.com/aron285-coder/hidrantes-albolote/commit/bf90a6e07577189ef45e2ff4f5b8e2169b54a3e0))
* **cola:** lo encolado durante un envío sale en la misma vuelta y nada se queda solo en memoria sin avisar ([#191](https://github.com/aron285-coder/hidrantes-albolote/issues/191)) ([9d05a6e](https://github.com/aron285-coder/hidrantes-albolote/commit/9d05a6ea37fb3d16e73040879fa49cac6c572977))
* **cola:** los errores desconocidos se reintentan, los fallidos se pueden reintentar y cerrar sesión no resucita envíos ([#194](https://github.com/aron285-coder/hidrantes-albolote/issues/194)) ([0b26553](https://github.com/aron285-coder/hidrantes-albolote/commit/0b26553780961a4bc2aff80b7afb5f1eb1cf8a83))
* **cola:** un cierre de sesión en vuelo no deja atascado lo nuevo, los reintentos respetan la generación y la pantalla se actualiza ([#249](https://github.com/aron285-coder/hidrantes-albolote/issues/249)) ([438f5ea](https://github.com/aron285-coder/hidrantes-albolote/commit/438f5eacb145adec796c6b462ed7f2183ac03c7a))
* **datos:** el tipo de un punto no se cambia; se retira y se da de alta el correcto ([#251](https://github.com/aron285-coder/hidrantes-albolote/issues/251)) ([acd2035](https://github.com/aron285-coder/hidrantes-albolote/commit/acd2035e5b8c8177dabc90606ebdb9cfcfe63394))
* **ficha:** un punto que vuelve a funcionar pierde la nota de fallo ([#256](https://github.com/aron285-coder/hidrantes-albolote/issues/256)) ([d8ff7fa](https://github.com/aron285-coder/hidrantes-albolote/commit/d8ff7fa5851ead0f860ad55251c4be469a2c78df))
* **fotos:** fotos en modo CORS y caché sin respuestas opacas ([#200](https://github.com/aron285-coder/hidrantes-albolote/issues/200)) ([d20e7a6](https://github.com/aron285-coder/hidrantes-albolote/commit/d20e7a63eec6f84de439cb6ced60f3a1e4df6726))
* **fotos:** la caché de fotos se versiona y el Service Worker borra la antigua con respuestas opacas ([#253](https://github.com/aron285-coder/hidrantes-albolote/issues/253)) ([135c913](https://github.com/aron285-coder/hidrantes-albolote/commit/135c913762e8f537bc2b25d20d4b57b64dbfc559))
* **fotos:** la purga recibe la lista entera de fotos referenciadas aunque pase de 1.000 ([#245](https://github.com/aron285-coder/hidrantes-albolote/issues/245)) ([e9a1698](https://github.com/aron285-coder/hidrantes-albolote/commit/e9a1698ce581996f00f0f532b02a0251ed2b5924))
* **fotos:** reservas de subida de 7 días y alta de jefatura sin depender de su correo ([#196](https://github.com/aron285-coder/hidrantes-albolote/issues/196)) ([c722f2e](https://github.com/aron285-coder/hidrantes-albolote/commit/c722f2e0e57994d5a8e8881b36b1ee19b1e08bcb))
* **fusion:** se elige también la descripción y el punto que se muda recalcula municipio y núcleo ([#207](https://github.com/aron285-coder/hidrantes-albolote/issues/207)) ([2ebd6a8](https://github.com/aron285-coder/hidrantes-albolote/commit/2ebd6a8849d7716a6ba1b298d3b0d8f6f58775dc))
* **jefatura:** la sincronización de jefatura lee por páginas y sin servidor jefatura sigue en el panel ([#204](https://github.com/aron285-coder/hidrantes-albolote/issues/204)) ([9dc0ee5](https://github.com/aron285-coder/hidrantes-albolote/commit/9dc0ee5d6d4db37d27a7f697c8c26fb3dd25e018))
* **listas:** retirar con motivo, correcciones en español y filtros de FR-68, FR-120 y FR-160 ([#210](https://github.com/aron285-coder/hidrantes-albolote/issues/210)) ([3a04721](https://github.com/aron285-coder/hidrantes-albolote/commit/3a047211b5495e82c0834432db0d597e7e8cd9c0))
* **mapabase:** el mapa avisa al arrancar si falta el mapa base y ofrece descargarlo ([#199](https://github.com/aron285-coder/hidrantes-albolote/issues/199)) ([b8da68b](https://github.com/aron285-coder/hidrantes-albolote/commit/b8da68ba901b435b39bc9eabf528eba78f8a95e9))
* **mapa:** el móvil deriva "sin revisar" y el radio del marcador con la config recibida ([#192](https://github.com/aron285-coder/hidrantes-albolote/issues/192)) ([7eda549](https://github.com/aron285-coder/hidrantes-albolote/commit/7eda54920054fc8078d97477a44e231aa4fb84bf))
* **moderacion:** espera de bloqueo de 5 s y lote que omite el punto ocupado ([#205](https://github.com/aron285-coder/hidrantes-albolote/issues/205)) ([272e256](https://github.com/aron285-coder/hidrantes-albolote/commit/272e256d704f470ce929bbc838afde9310faa00e))
* **piloto:** la promoción aborta con códigos que producción ya tiene con otro punto y los puntos llegan a los móviles ([#255](https://github.com/aron285-coder/hidrantes-albolote/issues/255)) ([e8a6b89](https://github.com/aron285-coder/hidrantes-albolote/commit/e8a6b89cd418f6c902bcc7475023736095f10325))
* **posicion:** un timeout del GPS ya no apaga el seguimiento ([#198](https://github.com/aron285-coder/hidrantes-albolote/issues/198)) ([606a4d4](https://github.com/aron285-coder/hidrantes-albolote/commit/606a4d489432a14a1af87a9398fd68ec0ab00fc5))
* **restauracion:** el código de acceso, las revocaciones y los administradores de ahora sobreviven a la restauración ([#252](https://github.com/aron285-coder/hidrantes-albolote/issues/252)) ([a679e58](https://github.com/aron285-coder/hidrantes-albolote/commit/a679e5843119b28c0575f2dc8b591723a0f257a0))
* **restauracion:** la época existe desde la migración y los códigos no retroceden al restaurar ([#246](https://github.com/aron285-coder/hidrantes-albolote/issues/246)) ([2e656b4](https://github.com/aron285-coder/hidrantes-albolote/commit/2e656b45313f77983a8b4aa438ff3c37aafb5fc0))
* **restauracion:** restaurar funciona sobre un esquema con datos y con volcados anteriores a 0010 ([#202](https://github.com/aron285-coder/hidrantes-albolote/issues/202)) ([f296209](https://github.com/aron285-coder/hidrantes-albolote/commit/f296209195ba63023639d91352ac35e15d3a1b69))
* **restauracion:** un volcado descifrado no puede acabar en el repositorio público ([#257](https://github.com/aron285-coder/hidrantes-albolote/issues/257)) ([70d329c](https://github.com/aron285-coder/hidrantes-albolote/commit/70d329c1f96b8f144204141c4c06748c39915a90))
* **salud:** versión del mapa base, tamaño de la base de datos y tareas programadas ([#209](https://github.com/aron285-coder/hidrantes-albolote/issues/209)) ([9ed4057](https://github.com/aron285-coder/hidrantes-albolote/commit/9ed4057060b5fda3de6e2edd6fb0ee4ce1dba33d))
* **seguridad:** anonimización con su texto exacto y Nominatim con contacto y caché ([#211](https://github.com/aron285-coder/hidrantes-albolote/issues/211)) ([ccc0cbd](https://github.com/aron285-coder/hidrantes-albolote/commit/ccc0cbd5244e6c5bc59a4a3f3b8ef7e1f1544f45))
* **seguridad:** jefatura exige una sesión de Google, no solo el correo del JWT ([#247](https://github.com/aron285-coder/hidrantes-albolote/issues/247)) ([e2f751e](https://github.com/aron285-coder/hidrantes-albolote/commit/e2f751e39a90d2a929bf7f213dadc657442058fd))
* **seguridad:** límites y defensas pequeñas en reservas, IP, intentos, núcleos y caché de direcciones ([#259](https://github.com/aron285-coder/hidrantes-albolote/issues/259)) ([e38bea9](https://github.com/aron285-coder/hidrantes-albolote/commit/e38bea9e14b51517ba4db5ab5c1b6a62cbad810f))
* **sincronizacion:** bajas de puntos purgados y época de los datos tras restaurar ([#195](https://github.com/aron285-coder/hidrantes-albolote/issues/195)) ([7b1c780](https://github.com/aron285-coder/hidrantes-albolote/commit/7b1c780eefa210bcccff104d5a9e3c8dae6d5631))
* **sincronizacion:** jefatura no se re-deriva con la config por defecto, diez minutos de solape y cerrar sesión descarta lo que llegaba ([#254](https://github.com/aron285-coder/hidrantes-albolote/issues/254)) ([24ac180](https://github.com/aron285-coder/hidrantes-albolote/commit/24ac180e463a504ee28ce63bbd43200191662305))
* **vigilancia:** las tareas se guardan, una semanal parada se detecta y los avisos reintentan ([#248](https://github.com/aron285-coder/hidrantes-albolote/issues/248)) ([dce815d](https://github.com/aron285-coder/hidrantes-albolote/commit/dce815d36b1fa072aa715a2236800c8fad2d46c1))
* **vigilancia:** un workflow que aún no ha corrido por calendario cuenta desde que existe ([#212](https://github.com/aron285-coder/hidrantes-albolote/issues/212)) ([a1d2fad](https://github.com/aron285-coder/hidrantes-albolote/commit/a1d2fade50914776a9f8e985e34dafba7472eca2))

## [0.4.0](https://github.com/aron285-coder/hidrantes-albolote/compare/hidrantes-albolote-v0.3.0...hidrantes-albolote-v0.4.0) (2026-09-22)


### Novedades

* **mantenimiento:** purgar las fotos huerfanas desde Ajustes y cada lunes ([#156](https://github.com/aron285-coder/hidrantes-albolote/issues/156)) ([2cbbde4](https://github.com/aron285-coder/hidrantes-albolote/commit/2cbbde495ea3f3d3c7bb2272533ff520beeb4f61))

## [0.3.0](https://github.com/aron285-coder/hidrantes-albolote/compare/hidrantes-albolote-v0.2.0...hidrantes-albolote-v0.3.0) (2026-09-22)


### Novedades

* **capturas:** scripts/capturas.ts deja las pantallas listas para 13 y 14 (F9.7) ([#145](https://github.com/aron285-coder/hidrantes-albolote/issues/145)) ([80a6726](https://github.com/aron285-coder/hidrantes-albolote/commit/80a6726c6a13df1689a5e864a73b5696c6f88b3b))
* **piloto:** scripts/promover-piloto.ts y su workflow con aprobacion (F9.5) ([#146](https://github.com/aron285-coder/hidrantes-albolote/issues/146)) ([66edd98](https://github.com/aron285-coder/hidrantes-albolote/commit/66edd981e88d9bfd00e1514fe5d5139c4913b69e))

## [0.2.0](https://github.com/aron285-coder/hidrantes-albolote/compare/hidrantes-albolote-v0.1.0...hidrantes-albolote-v0.2.0) (2026-09-21)


### Novedades

* **diseño:** el estado regular pasa a naranja (DEC-076) ([#141](https://github.com/aron285-coder/hidrantes-albolote/issues/141)) ([ab1cd95](https://github.com/aron285-coder/hidrantes-albolote/commit/ab1cd953ba193a94db81291e2056c0c13e389260))
* **mapa:** alta manteniendo pulsado el mapa, como en Google Maps ([#144](https://github.com/aron285-coder/hidrantes-albolote/issues/144)) ([9810222](https://github.com/aron285-coder/hidrantes-albolote/commit/981022248d0313b638c8f1f495d69730a68edf6b))


### Correcciones

* **mapa:** acercar hasta z21 y que ninguna capa se quede en blanco ([#139](https://github.com/aron285-coder/hidrantes-albolote/issues/139)) ([b67e6de](https://github.com/aron285-coder/hidrantes-albolote/commit/b67e6de80fb07723291378e3fccada1b0794c562))

## 0.1.0 (2026-09-21)


### Novedades

* **acceso:** entrada, primer uso, armazón, PWA y degradación (Fase 4) ([634ff7c](https://github.com/aron285-coder/hidrantes-albolote/commit/634ff7cba0709188654f745cf249e138136d2181))
* **acceso:** entrada, primer uso, armazón, PWA y degradación (Fase 4) ([38246ca](https://github.com/aron285-coder/hidrantes-albolote/commit/38246ca73422b63279d5261cd79ca982d1d63cd3))
* **app:** botón propio para instalar y "Mi posición" en el minimapa ([a4f52f6](https://github.com/aron285-coder/hidrantes-albolote/commit/a4f52f6c48f4e4aa20e05b9dda0b1fa7807fffc7))
* **app:** botón propio para instalar y "Mi posición" en el minimapa (DEC-064) ([915813c](https://github.com/aron285-coder/hidrantes-albolote/commit/915813c7bf4216db2d94166573edc05c4602b608))
* **arranque:** dejar listos los secretos del respaldo sin buscar valores ([f0943e4](https://github.com/aron285-coder/hidrantes-albolote/commit/f0943e40e375d4b16cf67aaf711ca85605fde833))
* **arranque:** dejar listos los secretos del respaldo sin buscar valores a mano ([4dcc0dc](https://github.com/aron285-coder/hidrantes-albolote/commit/4dcc0dc46b328dfd79fb0811367ac73bd1bbcd53))
* **ci:** Fase 0 · repositorio, entornos y despliegue ([230be05](https://github.com/aron285-coder/hidrantes-albolote/commit/230be05b78d75ae6389ee054bc60ca329b7889a5))
* **ci:** repositorio, entornos y despliegue (Fase 0) ([aef0ecf](https://github.com/aron285-coder/hidrantes-albolote/commit/aef0ecf82929bbcfbf114c1597abdc8cebfa3f06))
* **mapa:** mapa base propio, capas, simbología, lista, búsqueda y ficha (Fase 5) ([25e7f8d](https://github.com/aron285-coder/hidrantes-albolote/commit/25e7f8df1453848045f27e3870ac2c400a4352cc))
* **mapa:** mapa base propio, capas, simbología, lista, búsqueda y ficha (Fase 5) ([ca03e8c](https://github.com/aron285-coder/hidrantes-albolote/commit/ca03e8cfa487ae411479cb56465b5fc44d310c7a))
* **operaciones:** las seis operaciones, cola sin cobertura, Mis propuestas y avisos (Fase 6) ([dfb8f3a](https://github.com/aron285-coder/hidrantes-albolote/commit/dfb8f3a64f4f39ee69332e13f3c878caa0d92cff))
* **operaciones:** las seis operaciones, cola sin cobertura, Mis propuestas y avisos (Fase 6) ([8658dfa](https://github.com/aron285-coder/hidrantes-albolote/commit/8658dfa6d43ef9279053e59c15f4bdfcb4d9081f))
* **panel:** cola de revisión de jefatura (DEC-065, DEC-066) ([5e64f68](https://github.com/aron285-coder/hidrantes-albolote/commit/5e64f68e659c972d409385a087527e3b2198b388))
* **panel:** cola de revisión de jefatura (F7.1, F7.2) ([79230f0](https://github.com/aron285-coder/hidrantes-albolote/commit/79230f0c25df757c377a3f17c143065209e6d775))
* **panel:** inventario, caducadas, registro, papelera y exportación (DEC-067) ([b28e7ed](https://github.com/aron285-coder/hidrantes-albolote/commit/b28e7ed51949935a45c0f8836bf7529ef6f186d0))
* **panel:** inventario, caducadas, registro, papelera y exportación (F7.3–F7.6, F7.9) ([0279126](https://github.com/aron285-coder/hidrantes-albolote/commit/027912657335ccb9b5ce97333753b1128712e589))
* **panel:** voluntarios, ajustes, núcleos, QR y avisos (F7.7, F7.8, F7.10–F7.12) ([136c8a4](https://github.com/aron285-coder/hidrantes-albolote/commit/136c8a428ba2ae1495d0d463162b8cc42fdc9deb))
* **panel:** voluntarios, ajustes, núcleos, QR y avisos de jefatura (DEC-068) ([c8d6a70](https://github.com/aron285-coder/hidrantes-albolote/commit/c8d6a7088884054394e841b0ddbbd180d26f9ac0))
* **respaldo:** respaldo semanal cifrado y copia mensual de las fotos (F8.4) ([6103334](https://github.com/aron285-coder/hidrantes-albolote/commit/61033343cc851be97511cd3e1dcde23167caddf1))
* **respaldo:** workflow semanal cifrado y copia mensual de las fotos (F8.4) ([95d482e](https://github.com/aron285-coder/hidrantes-albolote/commit/95d482eaa00eaf220a9e5d6f2d27ff38888445b9))
* **restaurar:** scripts de restauración, probados sobre una base limpia (F8.14, F8.5) ([#126](https://github.com/aron285-coder/hidrantes-albolote/issues/126)) ([c7ca73e](https://github.com/aron285-coder/hidrantes-albolote/commit/c7ca73ed3b8ce9b2dc8a21ce54190ae94c88f689))
* **sql:** esquema hidrantes, RLS, config, pg_cron y seed (Fase 2) ([b3c3f59](https://github.com/aron285-coder/hidrantes-albolote/commit/b3c3f596791bd40e376d08134d5bd8d2195df09e))
* **sql:** esquema hidrantes, RLS, config, pg_cron y seed (Fase 2) ([5e79e24](https://github.com/aron285-coder/hidrantes-albolote/commit/5e79e2431970a29ab379d3d58c5b35fd0e7f995f))
* **sql:** RPC de voluntario y jefatura, y Pages Functions (Fase 3) ([ef8507d](https://github.com/aron285-coder/hidrantes-albolote/commit/ef8507d4898e501bbd8acac6e1f32a57cfdb4e95))
* **sql:** RPC de voluntario y jefatura, y Pages Functions (Fase 3) ([f4a1fc3](https://github.com/aron285-coder/hidrantes-albolote/commit/f4a1fc349928f7492162f669c274e5f58595e9f8))
* **vigilancia:** comprobación diaria con issue automática (F8.11) ([#129](https://github.com/aron285-coder/hidrantes-albolote/issues/129)) ([af48369](https://github.com/aron285-coder/hidrantes-albolote/commit/af48369565c60abde8aca77c4523fbeaa649615c))
* **zona:** zona de cobertura desde OpenStreetMap (Fase 1) ([5ebe42e](https://github.com/aron285-coder/hidrantes-albolote/commit/5ebe42ed313013e430d00d57cc07b8dd91705cad))
* **zona:** zona de cobertura desde OpenStreetMap (Fase 1) ([6344a5d](https://github.com/aron285-coder/hidrantes-albolote/commit/6344a5de93f1db705b674f275a170a79e7bc9727))


### Correcciones

* **arranque:** la clave GPG de los respaldos, en un formato que GnuPG lea ([4e3cfe0](https://github.com/aron285-coder/hidrantes-albolote/commit/4e3cfe0c8a59ddf3baf0c89665208e50b7df836e))
* **ci:** el arranque espera a que el pooler acepte la contraseña nueva ([29cab6b](https://github.com/aron285-coder/hidrantes-albolote/commit/29cab6bfe24f92c164c89da7f9a0b35e244286a9))
* **ci:** mantener-activo consulta una tabla que existe en ambos entornos ([29572a0](https://github.com/aron285-coder/hidrantes-albolote/commit/29572a0ae6a276f67f9ca61a60ac504737b7e5be))
* **ci:** mantener-activo hace una consulta que llega a la base de datos ([22e952c](https://github.com/aron285-coder/hidrantes-albolote/commit/22e952cfa75f9e408d2b0a019ebc65a899362494))
* **ci:** release-please puede abrir su PR; DEC-056 ([9fd3c9b](https://github.com/aron285-coder/hidrantes-albolote/commit/9fd3c9b136cf2ea53b0f76089ad4e9780c4d5603))
* **ci:** release-please puede abrir su PR; DEC-056 ([214a4ce](https://github.com/aron285-coder/hidrantes-albolote/commit/214a4ce82f4e4a024bec4f2247d29d7d41d90148))
* **ci:** una sola interfaz de lectura en los scripts interactivos ([eecd6bc](https://github.com/aron285-coder/hidrantes-albolote/commit/eecd6bc24f72b4b18cdc5d2d09e5d1addf8fd0ef))
* **diseño:** contraste medido y auditado, con axe y Lighthouse en CI (F8.7, F8.9) ([#128](https://github.com/aron285-coder/hidrantes-albolote/issues/128)) ([fd2d861](https://github.com/aron285-coder/hidrantes-albolote/commit/fd2d86103f656e2b17e2db12f6e44b15c2a8add9))
* **e2e:** estabiliza los dos casos de servidor caído ([d7efdea](https://github.com/aron285-coder/hidrantes-albolote/commit/d7efdea144ce6260aeca50d211ba0c3f288f151a))
* **mantenimiento:** despachar con workflow_dispatch (DEC-069) ([c45c33f](https://github.com/aron285-coder/hidrantes-albolote/commit/c45c33f68fcb37e558c27965b615d03774402f46))
* **mantenimiento:** el token de despacho solo necesita actions:write (DEC-069) ([8d9a523](https://github.com/aron285-coder/hidrantes-albolote/commit/8d9a52337db21472509382b3415f7546173e753e))
* **respaldo:** avisar si la cadena de conexión no es la del pooler ([41db2ac](https://github.com/aron285-coder/hidrantes-albolote/commit/41db2ac06ea9a8d648c70b3a4c8f04ff8be87b79))
* **respaldo:** avisar si la cadena de conexión no es la del pooler ([41afb52](https://github.com/aron285-coder/hidrantes-albolote/commit/41afb52926ba1e1933aa6c9bed847d92774daba7))
* **sql:** migrar funciona sin carpeta de migraciones ([6d049f7](https://github.com/aron285-coder/hidrantes-albolote/commit/6d049f7082176d9f85204195607c8612c45de2aa))
* **test:** contar solo lo propio, que en CI la base trae el seed ([8f7259c](https://github.com/aron285-coder/hidrantes-albolote/commit/8f7259ceb791f5bd3e2c266d078293f46b9b9f49))
* **zona:** no reescribir datos/ si solo cambia la fecha (DEC-070) ([3da1d22](https://github.com/aron285-coder/hidrantes-albolote/commit/3da1d22c6c6dbf57c838d1296f36fc2ca3b3f931))
* **zona:** regenerar la zona no abre un PR si solo cambia la fecha (DEC-070) ([1b4fc0d](https://github.com/aron285-coder/hidrantes-albolote/commit/1b4fc0d9b7c2f7adf60ff17414f94393e6f4dd98))
