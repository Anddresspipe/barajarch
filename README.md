# BarajaArch

**Sistema digital de juego de cartas en tiempo real.** Dos modalidades, **Clásica 4-3-3** y **Apuntado 101**, para 2 a 4 jugadores desde el navegador.

[![CI](https://github.com/Anddresspipe/barajarch/actions/workflows/ci.yml/badge.svg)](https://github.com/Anddresspipe/barajarch/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-3c873a)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

Proyecto de **Fundamentos de Arquitectura de Software**, Universidad Nacional de Colombia (Entregable 3: MVP, validación con usuarios y retrospectiva).
Autor: Andrés Felipe Ocampo Londoño.

## Contenido

- [Qué incluye](#qué-incluye)
- [Arquitectura](#arquitectura)
- [Cómo ejecutarlo](#cómo-ejecutarlo)
- [Cómo se juega](#cómo-se-juega)
- [Reglas de cada modalidad](#reglas-de-cada-modalidad)
- [Calidad y gobernanza](#calidad-y-gobernanza)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Configuración](#configuración)

## Qué incluye

- Partidas en tiempo real por WebSocket, con mazo, pozo, manos y turnos gestionados en el servidor.
- Ingreso con nombre y PIN, salas con código de 6 caracteres, historial por modalidad y reconexión a la partida en curso.
- Reloj de 60 segundos por turno con jugada automática, presencia de jugadores y fin de partida por abandono.
- Comodines opcionales y reversos de carta a elegir.
- Pruebas automáticas, fitness functions de arquitectura y un pipeline de CI con PostgreSQL.

## Arquitectura

Monolito modular por dominio con capas **Controlador → Servicio → Repositorio**.

| Módulo | Responsabilidad |
|---|---|
| `lobby` | Usuarios, PIN, sesiones y salas |
| `partidas` | Estado de la partida, turnos, reloj y persistencia |
| `motor-reglas` | Validación de manos y puntuación de cada modalidad |
| `compartido` | Tipos, cartas, bus de eventos y presencia |
| `app` | Arranque, HTTP y WebSocket |

Las modalidades son **plug-ins** (patrón Strategy): cada una implementa `ReglaJuego` y se registra en `RegistroReglas`. Agregar una modalidad nueva no toca el resto del código.

Los diagramas se dibujaron desde el código y están en `docs/modelos`:

| Despliegue | Secuencia (cierre de ronda) | Clases |
|---|---|---|
| ![Despliegue](docs/modelos/despliegue.png) | ![Secuencia](docs/modelos/secuencia.png) | ![Clases](docs/modelos/clases.png) |

Las decisiones de diseño están en `docs/adrs`.

## Cómo ejecutarlo

### Con Docker (recomendado)

```bash
docker compose up --build
```

Abre http://localhost:3000 en dos navegadores. Levanta la app y PostgreSQL 16, y aplica las migraciones al arrancar.

### Local, sin base de datos

Usa un repositorio en memoria. Sirve para desarrollo y para la demo.

```bash
cd backend
npm ci
npm run dev
```

### Local, con PostgreSQL

```bash
for f in backend/db/migrations/*.sql; do psql $DATABASE_URL -f $f; done
cd backend && DATABASE_URL=postgres://usuario:clave@localhost:5432/cartas npm run dev
```

### Windows (PowerShell)

```powershell
node -v          # debe ser 20 o superior
cd backend
npm ci
npm run dev      # http://localhost:3000, permite el firewall si lo pide
```

Si PowerShell dice que la ejecución de scripts está deshabilitada, usa `npm.cmd ci` y `npm.cmd run dev`, o abre el Símbolo del sistema. Para las pruebas con PostgreSQL: `$env:DATABASE_URL="postgres://usuario:clave@localhost:5432/cartas"`.

## Cómo se juega

1. **Entrar.** Escribe un nombre y un PIN de 4 a 8 dígitos. Un nombre nuevo se registra con ese PIN. Uno existente solo entra con su PIN y tras 5 fallos seguidos se bloquea un minuto.
2. **Sala.** Uno crea la sala eligiendo modalidad y recibe un código de 6 caracteres. Los demás lo escriben en *Unirme con un código*. El botón **?** junto a la modalidad explica sus reglas.
3. **Iniciar.** El administrador pulsa *Iniciar partida*. Se reparten 10 cartas a cada uno y se deja 1 en el pozo.
4. **Tu turno.** Un cartel amarillo indica de quién es. Roba del mazo o del pozo y luego descarta con un clic en una carta, o pulsa **Cerrar ronda** con 11 cartas. Si las 10 cartas con las que empiezas ya forman los grupos, puedes cerrar sin robar.
5. **Cerrar.** El botón está siempre disponible en tu turno y el juego no dice si tu mano está lista. Si cierras mal, pierdes 5 puntos y sigues jugando.
6. **Ordenar la mano.** Arrastra las cartas, usa Mayús + ← → o los botones *Ordenar por palo* y *Ordenar por valor*. El orden es solo tuyo.
7. **Última carta descartada.** Junto a cada jugador se ve la última carta que botó.

### Tiempo, presencia y reconexión

- **Reloj.** Cada turno dura `TURNO_SEGUNDOS` (60 por defecto, `0` lo desactiva). Si se agota, el sistema roba del mazo y descarta la carta que menos estorba, y se avisa a todos. Tras 3 turnos seguidos vencidos el jugador sale y sus cartas vuelven al mazo. Si queda uno solo, gana.
- **Presencia.** Cada jugador ve quién está sin conexión. El servidor manda un ping cada 15 s y corta las conexiones muertas. Si no queda nadie conectado el reloj se pausa. Si nadie vuelve en `ABANDONO_TOTAL_SEGUNDOS` (300), la partida termina sin ganador y cuenta como derrota para todos.
- **Reconexión.** *Ir al lobby (sigo en la partida)* no abandona. El lobby muestra *Mis partidas* para volver. Si cierras el navegador, entra con el mismo nombre y PIN y regresas a tu partida. *Abandonar* sí deja el asiento.
- **Historial.** El lobby muestra por modalidad las partidas jugadas, ganadas, ganadas porque el rival se fue, perdidas y abandonadas.
- **Seguridad.** El PIN se guarda con scrypt y sal. La conexión usa una ficha de sesión nueva en cada entrada, no la identidad real. Con PostgreSQL los usuarios y las partidas sobreviven a un reinicio. Sin base de datos todo vive en memoria.

## Reglas de cada modalidad

### Clásica 4-3-3

Se cierra con **1 cuarta + 2 ternas + 1 descarte**. Gana quien cierra la ronda.

### Apuntado 101

Se cierra de una de dos formas.

| Forma de cerrar | Quien cierra | Los demás |
|---|---|---|
| Como en Clásica (cuarta + 2 ternas + descarte) | Suma 10 | Restan sus puntos sueltos |
| Toque (3 ternas + sobrante de menos de 5 puntos) | No suma y resta los puntos de su carta sobrante | Restan sus puntos sueltos |

Quien llega a −101 o menos queda eliminado y quien llega a 51 o más gana.

### Comodines (opcional)

Al crear la sala se puede marcar *Jugar con los 4 comodines*. El mazo pasa a 56 cartas. Un comodín (★) vale por cualquier carta de una terna o cuarta, máximo uno por grupo. Un comodín que queda suelto resta 15 puntos y nunca sirve como sobrante del toque.

## Calidad y gobernanza

Todos los comandos se corren desde `backend/`.

| Comando | Qué hace |
|---|---|
| `npm run lint` | ESLint con complejidad ciclomática ≤ 10, sin literales de modalidad fuera de `motor-reglas` y `pg` solo en repositorios |
| `npm test` | Reglas, partidas, cierre simultáneo, PostgreSQL (si hay `DATABASE_URL`) y fitness functions |
| `npm run test:arch` | Fitness functions con TSArch: plug-ins sin acoplamiento, UI aislada del almacenamiento y sin ciclos |
| `npm run verificar:fitness` | Introduce violaciones a propósito y comprueba que se detectan |
| `npm run metricas` | Calcula CC, Ca, Ce, I, A y D y las guarda en `docs/metricas.json` |
| `npm run simular` | Juega una partida completa de cada modalidad con bots por WebSocket |
| `npm run validacion` | Resume `docs/validacion/resultados.csv` frente a los criterios de éxito |

La CI (`.github/workflows/ci.yml`) ejecuta todo lo anterior con PostgreSQL 16 en cada push.

## Estructura del repositorio

```
backend/        código fuente, pruebas, scripts y migraciones
frontend/       interfaz web (index.html, app.js, style.css)
docs/adrs/      decisiones de arquitectura
docs/modelos/   diagramas UML de despliegue, secuencia y clases
docs/validacion/  evidencias y resultados de la validación con usuarios
docs/metricas.json  métricas estructurales del código
.github/workflows/  pipeline de CI
docker-compose.yml  app y PostgreSQL
```

## Configuración

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | 3000 |
| `DATABASE_URL` | Conexión a PostgreSQL. Sin ella se usa memoria | sin definir |
| `FRONTEND_DIR` | Carpeta de los archivos estáticos | `frontend` |
| `TURNO_SEGUNDOS` | Duración del turno, `0` lo desactiva | 60 |
| `ABANDONO_TOTAL_SEGUNDOS` | Espera antes de cerrar una partida sin nadie conectado | 300 |
| `PING_MS` | Intervalo del ping de presencia | 15000 |
