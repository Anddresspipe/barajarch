# Validación con usuarios

Evidencias y resultados de las pruebas con 5 personas ajenas al desarrollo (U01 a U05). Los datos son reales y salen de un formulario de Google. Los resultados completos y su análisis están en la sección 3 del informe de la Entrega 3.

## Resultado en una mirada

| Criterio | Meta | Resultado | ¿Se cumple? |
|---|---|---|---|
| Cierre sin ayuda | ≥ 80 % | 40 % (2 de 5) | No |
| SUS medio | ≥ 68 | 83,0 | Sí |
| Satisfacción media | ≥ 4 | 4,4 | Sí |

Son pocas personas, casi todas cercanas al autor, así que los porcentajes son un indicio y no una prueba estadística. No se registraron errores, tiempo por turno ni modalidad jugada por persona. Esos datos no se estimaron.

## Archivos

| Archivo | Contenido |
|---|---|
| `respuestas-formulario.csv` | Respuestas por participante, solo con el código (U01, U02...) y sin nombres |
| `resultados.csv` | Resumen que lee el script de resultados: cierre válido, satisfacción, latencia percibida y SUS |
| `crear-formulario.gs` | Script de Google Apps Script que crea el formulario de la encuesta |
| `evidencias/` | Capturas de partidas reales y de la ejecución de la CI en GitHub Actions |

## Cómo reproducir el resumen

Desde `backend/`:

```bash
npm run validacion
```

Lee `resultados.csv` y compara con los criterios de éxito. Si no hay filas no inventa nada. Para calcular el SUS de un cuestionario suelto, con las 10 respuestas de 1 a 5:

```bash
npm run validacion -- sus 4 2 4 1 4 2 5 1 4 2
```

## Cómo crear la encuesta

1. Entra a https://script.google.com y crea un proyecto nuevo.
2. Pega el contenido de `crear-formulario.gs`.
3. Ejecuta la función `crearFormulario` y acepta los permisos.
4. Los enlaces para editar y para compartir el formulario salen en *Ver > Registros*.

El formulario abre con el aviso de que la participación es voluntaria y anónima, y recoge tareas, escalas de satisfacción, velocidad y claridad, el cuestionario SUS y cinco preguntas abiertas.

## Evidencias

Las imágenes de `evidencias/` se recortaron para no mostrar nada ajeno al juego.

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
