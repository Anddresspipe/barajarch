# ADR-01 Monolito modular por dominio

**Estado:** Vigente

**Contexto.** Un solo equipo, dominio pequeño; Service-Based propaga errores entre servicios y es costoso de operar.

**Decisión.** Un despliegue con módulos lobby, partidas, motor-reglas y compartido, y capas Controlador-Servicio-Repositorio.

**Consecuencias.** Despliegue simple; escalado de una sola unidad. Fronteras protegidas por fitness functions.
