# ADR-06 Persistencia por snapshot en el MVP

**Estado:** Propuesto (corrige deriva de ADR-04)

**Contexto.** Se necesitaba recuperar partidas rápido; el esquema 3FN completo excedía el alcance del MVP.

**Decisión.** Guardar la partida como snapshot JSONB y registrar cada cierre en ronda_cierre con clave primaria (partida_id, ronda).

**Consecuencias.** Entrega rápida y cierre idempotente; se pierden consultas relacionales. Migrar a tablas normalizadas alimentadas por eventos de cierre.
