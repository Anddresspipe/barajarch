# ADR-08 Identidad con nombre y PIN, y ficha de sesión

**Estado:** Vigente con límites

**Contexto.** Al principio el id que emitía el lobby era la credencial del WebSocket y los usuarios vivían en memoria. Cerrar la pestaña hacía perder la partida y cualquiera que conociera un id podía actuar como ese jugador.

**Decisión.** Entrar con nombre y PIN de 4 a 8 dígitos. El PIN se guarda como `scrypt(PIN, sal)` en la tabla `usuario`, con bloqueo de 60 s tras 5 fallos. Cada entrada entrega una ficha de sesión aleatoria y el WebSocket solo acepta fichas. El id real del usuario nunca sale del servidor.

**Consecuencias.** Se puede recuperar la cuenta y las partidas desde cualquier navegador. Las fichas viven en memoria (un reinicio obliga a volver a entrar) y el PIN viaja sin cifrar si no hay HTTPS. No hay recuperación de PIN.
