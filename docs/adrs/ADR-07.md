# ADR-07 Reloj de turno y presencia en el servidor

**Estado:** Vigente

**Contexto.** En las pruebas internas una partida se quedaba detenida cuando un jugador cerraba la pestaña o se distraía. Esperar a que vuelva bloqueaba a los demás.

**Decisión.** El servidor es dueño del tiempo. `PartidaService` arma un temporizador por turno (`TURNO_SEGUNDOS`, 60 por defecto) y, al vencer, roba y descarta por el jugador. Tras 3 turnos vencidos seguidos el jugador sale. `Presencia` cuenta las conexiones abiertas de cada usuario y el gateway manda un ping cada 15 s para cortar las conexiones muertas. Si nadie está conectado el reloj se pausa y, pasados 5 minutos, la partida termina como derrota para todos.

**Consecuencias.** Ninguna partida queda colgada. Los temporizadores viven en memoria del proceso, así que al reiniciar se rearman desde la base (`reanudarTemporizadores`). Con varias instancias habría que mover el reloj a un coordinador (ver 5.3).
