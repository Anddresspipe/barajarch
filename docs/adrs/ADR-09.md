# ADR-09 Historial derivado de las partidas terminadas

**Estado:** Vigente

**Contexto.** Se quería mostrar partidas jugadas, ganadas y perdidas por modalidad sin crear tablas nuevas (ADR-06 mantiene el snapshot).

**Decisión.** Calcular el historial al pedirlo, a partir de las partidas terminadas del jugador (`Historial.armarHistorial`). Cinco categorías por modalidad: jugadas, ganadas, ganadas porque el rival abandonó, perdidas y abandonadas. Si todos se van, es derrota para todos. Las partidas sin ronda cerrada no cuentan.

**Consecuencias.** Sin escritura extra ni riesgo de contadores desincronizados. Cada consulta recorre hasta 500 partidas del jugador, lo que no escala a un ranking global y por eso 5.3 lo mueve a consumidores de eventos.
