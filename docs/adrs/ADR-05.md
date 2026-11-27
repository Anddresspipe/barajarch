# ADR-05 Decisiones síncronas serializadas por partida

**Estado:** Vigente con límite

**Contexto.** Dos jugadores pueden actuar casi a la vez sobre la misma partida.

**Decisión.** Cola por partida y bus de eventos local; el cierre de ronda es idempotente (rondaEsperada y clave (partida_id, ronda)).

**Consecuencias.** Orden total por partida en una instancia; para varias instancias se requiere enrutamiento por partidaId.
