# Ejemplo de una sesión de validación (datos ficticios)

> **Esto es un ejemplo para practicar el procedimiento.** Los nombres, tiempos y comentarios son inventados y no cuentan como resultados. Los datos reales van solo en `resultados.csv`. El archivo `ejemplo-resultados.csv` existe únicamente para probar el resumen con `npm run validacion -- ../docs/validacion/ejemplo-resultados.csv`.

## Preparación (10 minutos antes)
1. Levanto el servidor con `docker compose up --build` y abro `http://localhost:3000` en dos ventanas, una normal y una de incógnito.
2. En la ventana de incógnito entro como `Rival / 1234`. En la otra dejo libre el registro para la persona.
3. Pongo el cronómetro del celular y abro la hoja de observación y `resultados.csv`.
4. Leo el consentimiento en voz alta y anoto el «sí» con la hora.

## Sesión de ejemplo con el participante EJ3 (22 minutos)
| Minuto | Qué pasa | Qué anoto |
|---|---|---|
| 0:00 | Leo el guion: «no te evalúo a ti, evalúo el juego». | Consentimiento verbal a las 4:05 p. m. |
| 1:30 | Se registra con nombre y PIN y crea una sala Clásica. Duda 20 s entre «Crear» y «Unirse». | Error 1: confusión en el lobby. Cita: «¿cuál es el botón para empezar yo?». |
| 4:00 | Juega 3 turnos. Cronometro cada uno: 52 s, 41 s, 42 s. | Tiempo por turno = (52 + 41 + 42) / 3 = 45 s. |
| 9:00 | Intenta cerrar con 2 cartas sueltas. El sistema responde «Cierre incorrecto: pierdes 5 puntos» y su marcador baja a −5. | Error 2: cierre inválido a propósito, no sabe qué le faltaba. Cita: «¿y ahora qué hice mal?». |
| 12:00 | Intenta cerrar una ronda válida y no lo consigue sin que yo le explique qué es una terna. | Ayuda a las 4:17 p. m. «Cierre válido sin ayuda» = No. |
| 15:00 | Prueba Apuntado y entiende el marcador. Dice que el reloj de 60 s lo apuró. | Error 3: se le acabó un turno y el sistema jugó por él. Cita: «me dio susto que jugara solo». |
| 20:00 | Cuestionario: satisfacción 3, rapidez 4 y los 10 ítems del SUS. | Respuestas SUS: `4 2 4 2 3 3 3 3 3 3`. |
| 22:00 | Cierro y le agradezco. | Guardo el consentimiento como `EJ3-consentimiento.txt`. |

## Convertir las notas en una fila
1. Calculo el SUS: `npm run validacion -- sus 4 2 4 2 3 3 3 3 3 3`. En este ejemplo da 60, que va en la última columna.
2. Agrego la fila al CSV: `EJ3,Clasica,No,3,45,3,4,60`: 3 errores anotados, 45 s por turno, satisfacción 3, rapidez 4 y SUS 60.
3. Corro `npm run validacion` y miro si cada promedio cumple su criterio.

## Qué hacer con lo que sale
Cada comentario relevante se convierte en un hallazgo con una acción. En este ejemplo:
| Hallazgo | Evidencia | Acción posible |
|---|---|---|
| No saben por qué fue incorrecto el cierre | Cita de EJ3, 2 de 3 participantes dudaron | Revisar si 5 puntos es razonable y si la explicación del botón ? alcanza (sección 3.4) |
| El reloj asusta cuando juega solo | Cita de EJ3 | Avisar con un sonido o color a los 10 s |
| No se sabe cuál botón es crear | 20 s de duda | Cambiar el texto del botón a «Crear sala nueva» |

Con esos tres participantes ficticios el resumen da cierre válido de 67 % (menor al criterio de 80 %) y SUS de 70,8, que sí cumple. Si pasara con datos reales, lo escribo tal cual en el informe y explico qué se cambió o qué queda pendiente. No se oculta ni se ajusta.
