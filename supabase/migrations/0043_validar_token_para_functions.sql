-- 0043 · /api/push y /api/geocodificar pueden comprobar el token de un voluntario (#561, docs/32 RV-270 D1).
--
-- Las dos Functions comprobaban el token llamando a fn_listar_puntos con service_role, pero 0007 solo
-- se la concede a anon y authenticated: la llamada fallaba con permiso denegado, la Function lo leía
-- como token no válido y contestaba 401 a todos los voluntarios (buscar portales y el aviso inmediato
-- no funcionaban nunca). Ahora llaman a fn_validar_token, el ayudante que ya usan todas las RPC de
-- voluntario por dentro: solo comprueba el token y anota ultimo_uso, sin leer el inventario.
--
-- Solo service_role: anon y authenticated siguen sin poder ejecutarla (02, 34). fn_listar_puntos no se
-- abre a service_role. Sin cambio de cuerpo ni de firma: la app y las Functions anteriores no cambian.

grant execute on function hidrantes.fn_validar_token(text) to service_role;
