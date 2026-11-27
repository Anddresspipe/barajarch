/* Demo/E2E: levanta el servidor real y juega partidas completas con bots por WebSocket. */
import WebSocket from 'ws';
import { arrancar } from '../src/app/main';
import { Carta } from '../src/motor-reglas/Carta';
import { minimoPuntosSueltos } from '../src/motor-reglas/EvaluadorCombinaciones';
import { crearRegistroPorDefecto } from '../src/motor-reglas/registroPorDefecto';

// Esto prueba el flujo de juego, no la base de datos (eso lo cubre tests/partidas/postgres.test.ts).
// Con PostgreSQL cada accion guarda el snapshot completo (~330 acciones/s medidas) y una partida de
// Apuntado entre bots puede tardar minutos, lo que haria inestable el CI.
if (!process.env.SIMULAR_CON_DB) delete process.env.DATABASE_URL;
process.env.MAX_MENSAJES_SEG ??= '100000';   // los bots juegan mucho mas rapido que una persona

const LIMITE_MS = Number(process.env.LIMITE_MS ?? 120000);
const PUERTO = 3900 + Math.floor(Math.random() * 90);
const registro = crearRegistroPorDefecto();
type Vista = { id: string; version: number; modalidad: string; estado: string; ronda: number; fase: string; yo: string; turnoDe: string; tuMano: string[]; ganadorId?: string; jugadores: { id: string; nombre: string; acumulado: number }[] };

async function usuario(nombre: string): Promise<string> {
  const r = await fetch(`http://localhost:${PUERTO}/api/usuarios`, { method: 'POST', body: JSON.stringify({ nombre, pin: '1234' }) });
  return ((await r.json()) as { id: string }).id;
}

const latencias: number[] = [];   // ms entre que un bot envia una accion y recibe la vista que la confirma

class Bot {
  vista?: Vista; ws!: WebSocket; errores: string[] = []; pendiente = false; enviadoEn = 0;
  constructor(public id: string, public nombre: string, private tamanos: number[]) {}
  conectar(): Promise<void> {
    this.ws = new WebSocket(`ws://localhost:${PUERTO}/ws?jugador=${this.id}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.tipo === 'error') { this.errores.push(m.codigo); return; }
      const v: Vista = m.vista;
      if (this.vista && v.id === this.vista.id && v.version <= this.vista.version) return;   // repetida o vieja
      this.vista = v;
      if (this.pendiente && this.enviadoEn) latencias.push(Date.now() - this.enviadoEn);
      this.pendiente = false;
      void this.jugar();
    });
    return new Promise((ok) => this.ws.on('open', () => ok()));
  }
  enviar(c: object): void { this.pendiente = true; this.enviadoEn = Date.now(); this.ws.send(JSON.stringify({ partidaId: this.vista?.id, ...c })); }
  async jugar(): Promise<void> {
    const v = this.vista;
    if (!v || v.estado !== 'EN_CURSO' || v.turnoDe !== v.yo || this.pendiente) return;
    const mano = v.tuMano.map(Carta.desde);
    if (registro.obtener(v.modalidad).validarCierre(mano).valido) return this.enviar({ accion: 'cerrar', ronda: v.ronda });
    if (v.fase === 'ROBAR') return this.enviar({ accion: 'robar', origen: 'MAZO' });
    let mejor = 0, puntaje = Infinity;
    mano.forEach((_, i) => {
      const p = minimoPuntosSueltos(mano.filter((__, k) => k !== i), this.tamanos);
      if (p < puntaje) { puntaje = p; mejor = i; }
    });
    this.enviar({ accion: 'descartar', carta: mano[mejor].codigo() });
  }
}

async function partida(modalidad: string, tamanos: number[]): Promise<void> {
  const [a, b] = await Promise.all([usuario('Ana'), usuario('Beto')]);
  const ba = new Bot(a, 'Ana', tamanos), bb = new Bot(b, 'Beto', tamanos);
  await Promise.all([ba.conectar(), bb.conectar()]);
  const t0 = Date.now();
  ba.ws.send(JSON.stringify({ accion: 'crear', modalidad, nombre: 'Ana' }));
  await new Promise((r) => setTimeout(r, 200));
  bb.ws.send(JSON.stringify({ accion: 'unirse', partidaId: ba.vista!.id, nombre: 'Beto' }));
  await new Promise((r) => setTimeout(r, 200));
  ba.ws.send(JSON.stringify({ accion: 'iniciar', partidaId: ba.vista!.id }));
  while (ba.vista?.estado !== 'FINALIZADA' && Date.now() - t0 < LIMITE_MS) await new Promise((r) => setTimeout(r, 100));
  const v = ba.vista!;
  console.log(`[${modalidad}] estado=${v.estado} rondas=${v.ronda} ganador=${v.jugadores.find((j) => j.id === v.ganadorId)?.nombre} marcador=${v.jugadores.map((j) => `${j.nombre}:${j.acumulado}`).join(' ')} (${Date.now() - t0} ms)`);
  if (v.estado !== 'FINALIZADA') console.log(`[${modalidad}] ATASCADA: turnoDe=${v.turnoDe} fase=${v.fase} version=${v.version} | vista A: v${ba.vista?.version} turno=${ba.vista?.turnoDe === ba.vista?.yo} fase=${ba.vista?.fase} | vista B: v${bb.vista?.version} turno=${bb.vista?.turnoDe === bb.vista?.yo} fase=${bb.vista?.fase} | pendientes A=${ba.pendiente} B=${bb.pendiente}`);
  const errores = [...ba.errores, ...bb.errores];
  if (errores.length) console.log(`[${modalidad}] errores recibidos por los bots (${errores.length}):`, [...new Set(errores)].join(', '));
  ba.ws.close(); bb.ws.close();
  if (v.estado !== 'FINALIZADA') process.exitCode = 1;
}

function percentil(orden: number[], q: number): number { return orden[Math.min(orden.length - 1, Math.floor(q * orden.length))]; }

function resumenLatencia(): void {
  if (!latencias.length) return;
  const o = [...latencias].sort((a, b) => a - b);
  console.log(`[latencia] ${o.length} acciones: mediana=${percentil(o, 0.5)} ms, p95=${percentil(o, 0.95)} ms, maxima=${o[o.length - 1]} ms (${process.env.SIMULAR_CON_DB ? 'con PostgreSQL' : 'en memoria'}, misma maquina)`);
}

/** Con base de datos el servidor escucha despues de migrar: se espera a que responda. */
async function esperarServidor(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://localhost:${PUERTO}/api/salud`)).ok) return; } catch { /* aun no escucha */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('el servidor no arranco a tiempo');
}

async function main(): Promise<void> {
  const server = arrancar(PUERTO);
  await esperarServidor();
  await partida('CLASICA', [3, 4]);
  await partida('APUNTADO', [3]);
  resumenLatencia();
  server.close(); process.exit(process.exitCode ?? 0);
}
void main();
