# Validación con usuarios

Se aplicó una encuesta de Google Forms a 5 personas ajenas al desarrollo (U01 a U05), con datos reales. El análisis completo está en la sección 3 del informe de la Entrega 3.

## Resultados

| Criterio | Meta | Resultado | ¿Se cumple? |
|---|---|---|---|
| Cierre sin ayuda | ≥ 80 % | 40 % (2 de 5) | No |
| SUS medio | ≥ 68 | 83,0 | Sí |
| Satisfacción media | ≥ 4 | 4,4 | Sí |

No se registraron errores, tiempo por turno ni modalidad jugada por persona.

## Archivos

| Archivo | Contenido |
|---|---|
| `respuestas-formulario.csv` | Respuestas por participante, solo con el código (U01 a U05) |
| `resultados.csv` | Cierre válido, satisfacción, latencia percibida y SUS por participante |
| `crear-formulario.gs` | Script de Google Apps Script con el que se creó el formulario |
| `evidencias/` | Capturas de partidas reales y de la ejecución de la CI |

## Evidencias

| Captura | Qué muestra |
|---|---|
| `01-clasica-turno-vencido-jugada-automatica` | El sistema juega por quien agotó el tiempo |
| `02-clasica-victoria-por-abandono-y-historial` | Victoria porque el rival se fue y el historial del lobby |
| `03-clasica-4-jugadores-mano-de-11-cartas` | Partida Clásica de 4 jugadores |
| `04-clasica-4-jugadores-ultimo-descarte` | Última carta descartada junto a cada jugador |
| `05-clasica-con-comodines-ultimo-descarte` | Partida con comodines |
| `06-apuntado-cierre-de-ronda-1-liquidacion` | Liquidación de la ronda 1 en Apuntado |
| `07-apuntado-cierre-de-ronda-2-liquidacion` | Liquidación de la ronda 2 en Apuntado, cierre con toque |
| `08-github-actions-ejecucion-1` | Primera ejecución de la CI en verde |
