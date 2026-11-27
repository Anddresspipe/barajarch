import WebSocket from 'ws';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { arrancar } from '../../src/app/main';

async function registrar(puerto: number, nombre: string): Promise<string> {
  const r = await fetch(`http://localhost:${puerto}/api/usuarios`, { method: 'POST', body: JSON.stringify({ nombre, pin: '1234' }) });
  return ((await r.json()) as { id: string }).id;
}
const esperar = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(cond()).toBe(true);
};
type Vista = { jugadores: { nombre: string; conectado: boolean }[] };

describe('Latido y presencia por WebSocket', () => {
  let server: Server; let puerto: number;
  beforeAll(() => { delete process.env.DATABASE_URL; process.env.PING_MS = '100'; server = arrancar(0); puerto = (server.address() as AddressInfo).port; });
  afterAll(() => { delete process.env.PING_MS; return new Promise<void>((ok) => server.close(() => ok())); });

  it('una conexion que no responde al ping se corta y el rival ve que esta desconectada', async () => {
    const idAna = await registrar(puerto, 'Ana'); const idBeto = await registrar(puerto, 'Beto');
    const ana = new WebSocket(`ws://localhost:${puerto}/ws?jugador=${idAna}`);
    const beto = new WebSocket(`ws://localhost:${puerto}/ws?jugador=${idBeto}`, { autoPong: false } as never);   // simula una conexion muerta
    const deAna: { tipo: string; vista?: Vista }[] = [];
    ana.on('message', (d) => deAna.push(JSON.parse(d.toString())));
    await Promise.all([ana, beto].map((w) => new Promise((ok) => w.on('open', ok))));
    ana.send(JSON.stringify({ accion: 'crear', modalidad: 'CLASICA' }));
    await esperar(() => deAna.some((m) => m.tipo === 'vista'));
    const id = (deAna[0].vista as unknown as { id: string }).id;
    beto.send(JSON.stringify({ accion: 'unirse', partidaId: id }));
    ana.send(JSON.stringify({ accion: 'iniciar', partidaId: id }));
    await esperar(() => deAna.some((m) => m.vista?.jugadores.length === 2 && m.vista.jugadores.every((j) => j.conectado)));
    let cerro = false; beto.on('close', () => { cerro = true; });
    await esperar(() => cerro);                         // el servidor la termino por no responder
    await esperar(() => deAna.some((m) => m.vista?.jugadores.some((j) => j.nombre === 'Beto' && !j.conectado)));
    ana.close();
  });

  it('el comando historial devuelve el conteo por modalidad', async () => {
    const ws = new WebSocket(`ws://localhost:${puerto}/ws?jugador=${await registrar(puerto, 'Hist')}`);
    const msgs: { tipo: string; historial?: { porModalidad: Record<string, { jugadas: number }> } }[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
    await new Promise((ok) => ws.on('open', ok));
    ws.send(JSON.stringify({ accion: 'historial' }));
    await esperar(() => msgs.some((m) => m.tipo === 'historial'));
    const h = msgs.find((m) => m.tipo === 'historial')!.historial!;
    expect(Object.keys(h.porModalidad).sort()).toEqual(['APUNTADO', 'CLASICA']);
    expect(h.porModalidad.CLASICA.jugadas).toBe(0);
    ws.close();
  });
});
