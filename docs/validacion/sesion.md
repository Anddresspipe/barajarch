# Kit para correr una sesión de validación

Una sesión dura como máximo 25 minutos y la hace una persona ajena al desarrollo. Como trabajo solo, soy a la vez moderador y observador: uso un cronómetro y anoto en la hoja justo después de cada tarea. Si puedo, pido a un amigo que tome notas. Hacen falta dos ventanas del navegador o dos computadores (en la segunda juego yo como rival).

## Antes de empezar
1. Levantar el servidor: `docker compose up --build` (o `cd backend && npm run dev`) y abrir `http://localhost:3000`.
2. Crear una cuenta para el rival que juego yo (por ejemplo `Rival / 1234`) y una para la persona (se le deja elegir nombre y PIN).
3. Tener a mano el consentimiento, la hoja de observación y el cuestionario de esta carpeta. Si se graba la pantalla, avisar antes.

## Lo que dice el moderador
«Vamos a probar un juego de cartas, no a evaluarte a ti. Si algo no se entiende, es culpa del juego. Voy a pedirte cuatro cosas y no te voy a ayudar salvo que llevemos un minuto bloqueados. Puedes parar cuando quieras.»

## Tareas
1. Entrar con un nombre y un PIN, y crear o unirse a una sala eligiendo la modalidad.
2. Jugar al menos 3 turnos completos de Clásica: robar del mazo o del pozo, organizar la mano y descartar.
3. Pulsar Cerrar ronda con la mano sin armar a propósito y ver que pierde 5 puntos (el juego no le dice qué le falta). Después cerrar bien con una mano armada. Observar si sabe decidir cuándo cerrar sin ayuda.
4. Jugar rondas consecutivas de Apuntado hasta ver el acumulado y el fin de la partida.

## Hoja de observación (una por persona)
| Campo | Anotación |
|---|---|
| ID de participante | U01, U02… (sin nombre) |
| Modalidad probada | Clásica / Apuntado / Ambas |
| ¿Cerró una ronda válida sin ayuda? | Sí / No (y por qué) |
| Errores o confusiones | Acciones rechazadas, dudas en voz alta, momentos de bloqueo |
| Ayudas dadas | Hora y motivo |
| Tiempo por turno | Promedio de 3 turnos con cronómetro (s) |
| Citas textuales | Lo que dijo, sin parafrasear |

## Preguntas al final
1. ¿Qué tan satisfecho quedó con la experiencia? (1 a 5)
2. ¿Qué tan rápido respondió el juego? (1 a 5, donde 5 es inmediato)
3. Cuestionario SUS: los 10 ítems del informe, respuestas de 1 a 5.

Para calcular un SUS: `cd backend && npm run validacion -- sus 4 2 4 1 4 2 5 1 4 2` (las 10 respuestas en orden).

## Consentimiento (texto para leer o imprimir)
«Participo de forma voluntaria en una prueba de un juego de cartas para un trabajo de la Universidad Nacional de Colombia. Entiendo que se anotarán mis acciones y comentarios con un código anónimo (sin mi nombre), que puedo parar cuando quiera y que los datos solo se usan en el informe del curso.»
Firma o aceptación verbal registrada: ______

## Después de la sesión
1. Agregar una fila a `resultados.csv` con los datos observados (columnas en la primera línea).
2. Guardar aquí las capturas, grabaciones y el consentimiento con el ID del participante.
3. Ejecutar `cd backend && npm run validacion` para ver promedios y compararlos con los criterios (cierre válido ≥ 80 %, SUS ≥ 68, satisfacción ≥ 4).


Hay un ejemplo completo con datos ficticios en `ejemplo.md`. No se mezcla con los resultados reales.
