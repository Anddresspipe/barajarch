# BarajaArch — Sistema Digital de Juego de Cartas (Entregable 3)

MVP jugable de **Clásica 4-3-3** y **Apuntado 101** para 2–4 jugadores en tiempo real.
Curso: Fundamentos de Arquitectura de Software · Universidad Nacional de Colombia.
Autor: Andrés Felipe Ocampo Londoño.

## Arquitectura
Monolito modular por dominio (`lobby`, `partidas`, `motor-reglas`, `compartido`) con capas Controlador → Servicio → Repositorio.
Las modalidades son plug-ins (Strategy) que implementan `ReglaJuego` y se registran en `RegistroReglas`. Ver `docs/adrs` y `docs/modelos`.

## Ejecutar
### Opción A — Docker (recomendada)
```bash
docker compose up --build
# abrir http://localhost:3000 en dos navegadores
```
> Si ya tenías la base de datos creada, no hace falta tocarla: al arrancar, la app aplica las migraciones pendientes (tabla `usuario`). Tras actualizar con Docker usa `docker compose up --build` para que la imagen incluya el frontend nuevo.

### Opción B — local (sin base de datos: repositorio en memoria)
```bash
cd backend && npm ci && npm run dev      # http://localhost:3000
```
Con PostgreSQL: `for f in backend/db/migrations/*.sql; do psql $DATABASE_URL -f $f; done` y `DATABASE_URL=postgres://… npm run dev`.

### Windows (PowerShell)
```powershell
node -v                                  # debe ser 20 o superior (https://nodejs.org, versión LTS)
cd backend
npm ci
npm run dev                              # abrir http://localhost:3000 (permitir el firewall si lo pide)
```
Si PowerShell dice que la ejecución de scripts está deshabilitada, usa `npm.cmd ci` y `npm.cmd run dev`, o abre *Símbolo del sistema*.
Para las pruebas con PostgreSQL: `$env:DATABASE_URL="postgres://usuario:clave@localhost:5432/cartas"`.
Docker Desktop (con WSL2) también sirve: `docker compose up --build`.

## Manual de juego (UI)
1. Cada jugador escribe su nombre y un PIN de 4 a 8 dígitos. Un nombre nuevo se registra con ese PIN; uno existente solo entra con su PIN (5 fallos seguidos bloquean el nombre un minuto). 2. Uno crea la sala eligiendo modalidad y recibe un **código de 6 caracteres** (botón *Copiar código*). Los demás lo escriben en *Unirme con un código*. Junto a la modalidad, el botón **?** explica cómo se juega.
3. El administrador pulsa *Iniciar partida* (reparte 10 cartas y deja 1 en el pozo).
4. Un cartel amarillo indica de quién es el turno. En tu turno: **robar** (mazo o pozo), luego **descartar** (clic en una carta) o **Cerrar ronda** con 11 cartas. Si las 10 cartas con las que empiezas el turno ya forman los grupos, puedes cerrar sin robar. El botón **Cerrar ronda** está siempre disponible en tu turno y el juego no dice si tu mano está lista: si cierras mal, pierdes 5 puntos.
5. Puedes ordenar tu mano en cualquier momento: arrastra las cartas, usa Mayús + ← → o los botones *Ordenar por palo/valor*. El orden es solo tuyo.
6. **Límite de tiempo:** cada turno dura `TURNO_SEGUNDOS` (60 por defecto; `0` lo desactiva). Un reloj muestra lo que queda; si se agota, el sistema roba del mazo y descarta la carta que menos estorba, y se avisa a todos. Tras 3 turnos seguidos vencidos el jugador sale de la partida (sus cartas vuelven al mazo; si queda uno solo, gana).
7. **Presencia:** cada jugador ve quién está sin conexión (el servidor manda un ping cada 15 s y corta las conexiones muertas). Si no queda nadie conectado el reloj se pausa; al volver el primero, el turno empieza de nuevo. Si nadie vuelve en `ABANDONO_TOTAL_SEGUNDOS` (300), la partida termina sin ganador y cuenta como derrota para todos.
8. **Historial:** el lobby muestra, por modalidad, partidas jugadas, ganadas, ganadas porque el rival se fue, perdidas y abandonadas, más las últimas 10. Quien se va (o es sacado por inactividad) suma "abandonada"; quien gana porque los demás se fueron suma una victoria aparte; salir de una sala que no empezó no cuenta.
9. **Reconexión:** *Ir al lobby (sigo en la partida)* no abandona; el lobby muestra *Mis partidas* para volver a ellas, y al recargar o reconectar se vuelve solo a la partida en curso. *Abandonar* sí deja el asiento (en sala en espera libera el lugar). Si cierras el navegador, entra con el mismo nombre y PIN desde cualquier navegador y vuelves a tu partida. El PIN se guarda con scrypt + sal; la conexión usa una ficha de sesión nueva en cada entrada, no la identidad real. Con PostgreSQL los usuarios (tabla `usuario`, migración 002) y sus partidas sobreviven a un reinicio; sin base de datos todo vive en memoria.
- Clásica: 1 cuarta + 2 ternas + 1 descarte; gana quien cierra.
- Comodines (opcional): al crear la sala se puede marcar *Jugar con los 4 comodines*. El mazo pasa a 56 cartas. Un comodín (★) vale por cualquier carta de una terna o cuarta, máximo uno por grupo. Un comodín que queda suelto resta 15 puntos y nunca sirve como sobrante del toque.
- Apuntado: se cierra como en Clásica (cuarta + 2 ternas + descarte) o con toque (3 ternas + sobrante < 5 puntos); quien cierra como en Clásica suma 10, quien cierra con toque no suma y resta los puntos de su carta sobrante, y los demás restan sus puntos sueltos; ≤ −101 queda eliminado, ≥ 51 gana.

## Calidad y gobernanza
| Comando (en `backend/`) | Qué hace |
|---|---|
| `npm run lint` | ESLint: CC ≤ 10, sin literales de modalidad fuera de `motor-reglas`, `pg` solo en repositorios |
| `npm test` | Reglas, partidas, cierre simultáneo, PostgreSQL (si hay `DATABASE_URL`) y fitness functions |
| `npm run test:arch` | Fitness functions (TSArch): plug-ins sin acoplamiento, UI aislada del almacenamiento, sin ciclos |
| `npm run verificar:fitness` | Mutación: introduce violaciones y comprueba que se detectan |
| `npm run metricas` | CC, Ca, Ce, I, A, D → `docs/metricas.json` |
| `npm run simular` | Partida completa de cada modalidad con bots por WebSocket (en memoria; `SIMULAR_CON_DB=1` para usar PostgreSQL, mucho más lento) |

CI: `.github/workflows/ci.yml` ejecuta todo lo anterior con PostgreSQL 16.
Evidencias de validación con usuarios: `docs/validacion/`.
