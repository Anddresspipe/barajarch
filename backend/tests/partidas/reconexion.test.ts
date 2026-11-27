import WebSocket from 'ws';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { arrancar } from '../../src/app/main';

type Msg = { tipo: string; vista?: { id: string; tuMano: string[]; yo: string }; codigo?: string };

function abrir(puerto: number, jugador: string): Promise<{ ws: WebSocket; recibidos: Msg[] }> {
  const ws = new WebSocket(`ws://localhost:${puerto}/ws?jugador=${jugador}`);
  const recibidos: Msg[] = [];
  ws.on('message', (d) => recibidos.push(JSON.parse(d.toString())));
  return new Promise((ok) => ws.on('open', () => ok({ ws, recibidos })));
}
async function registrar(puerto: number, nombre: string): Promise<string> {
  const r = await fetch(`http://localhost:${puerto}/api/usuarios`, { method: 'POST', body: JSON.stringify({ nombre, pin: '1234' }) });
  return ((await r.json()) as { id: string }).id;
}
const esperar = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(cond()).toBe(true);
};

describe('Reconexion y salida por WebSocket', () => {
  let server: Server; let puerto: number;
  beforeAll(() => { delete process.env.DATABASE_URL; server = arrancar(0); puerto = (server.address() as AddressInfo).port; });
  afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

  it('un jugador que se cae recupera su partida y su mano con el comando estado', async () => {
    const idAna = await registrar(puerto, 'Ana'); const idBeto = await registrar(puerto, 'Beto');
    const a = await abrir(puerto, idAna); const b = await abrir(puerto, idBeto);
    a.ws.send(JSON.stringify({ accion: 'crear', modalidad: 'CLASICA', nombre: 'Ana' }));
    await esperar(() => a.recibidos.some((m) => m.tipo === 'vista'));
    const id = a.recibidos[0].vista!.id;
    b.ws.send(JSON.stringify({ accion: 'unirse', partidaId: id, nombre: 'Beto' }));
    await esperar(() => b.recibidos.some((m) => m.tipo === 'vista'));
    a.ws.send(JSON.stringify({ accion: 'iniciar', partidaId: id }));
    await esperar(() => a.recibidos.some((m) => m.vista?.tuMano.length === 10));
    const manoAntes = a.recibidos.filter((m) => m.vista?.tuMano.length === 10).pop()!.vista!.tuMano;

    a.ws.close();                                              // cae la conexion
    const a2 = await abrir(puerto, idAna);                     // reconecta con la misma identidad
    a2.ws.send(JSON.stringify({ accion: 'estado', partidaId: id }));
    await esperar(() => a2.recibidos.some((m) => m.tipo === 'vista'));
    expect(a2.recibidos[0].vista!.tuMano).toEqual(manoAntes);

    a2.ws.send(JSON.stringify({ accion: 'salir' }));           // tras salir ya no recibe difusiones
    await esperar(() => a2.recibidos.some((m) => m.tipo === 'salio'));
    const n = a2.recibidos.length;
    b.ws.send(JSON.stringify({ accion: 'estado', partidaId: id }));
    b.ws.send(JSON.stringify({ accion: 'robar', partidaId: id, origen: 'MAZO' }));
    await new Promise((r) => setTimeout(r, 200));
    expect(a2.recibidos.length).toBe(n);
    a2.ws.close(); b.ws.close();
  });

  it('estado de una partida inexistente devuelve error', async () => {
    const x = await abrir(puerto, await registrar(puerto, 'Xavi'));
    x.ws.send(JSON.stringify({ accion: 'estado', partidaId: 'noexiste' }));
    await esperar(() => x.recibidos.some((m) => m.tipo === 'error'));
    expect(x.recibidos[0].codigo).toBe('PARTIDA_NO_ENCONTRADA');
    x.ws.close();
  });

  it('rechaza conexiones con un id que no emitio el lobby', async () => {
    const ws = new WebSocket(`ws://localhost:${puerto}/ws?jugador=inventado`);
    const codigo = await new Promise<number>((ok) => ws.on('close', (c) => ok(c)));
    expect(codigo).toBe(4001);
  });

  it('un mensaje mal formado recibe un error controlado y la conexion sigue viva', async () => {
    const u = await abrir(puerto, await registrar(puerto, 'Uli'));
    u.ws.send('esto no es json');
    await esperar(() => u.recibidos.length === 1);
    expect(u.recibidos[0].codigo).toBe('MENSAJE_INVALIDO');
    u.ws.send(JSON.stringify({ accion: 'bailar' }));
    await esperar(() => u.recibidos.length === 2);
    expect(u.recibidos[1].codigo).toBe('ACCION_DESCONOCIDA');
    u.ws.close();
  });

  it('el comando mias devuelve las partidas sin terminar y abandonar una sala en espera la quita', async () => {
    const idLu = await registrar(puerto, 'Lu'); const idMa = await registrar(puerto, 'Ma');
    const l = await abrir(puerto, idLu); const m = await abrir(puerto, idMa);
    l.ws.send(JSON.stringify({ accion: 'crear', modalidad: 'CLASICA' }));
    await esperar(() => l.recibidos.some((x) => x.tipo === 'vista'));
    const id = l.recibidos[0].vista!.id;
    m.ws.send(JSON.stringify({ accion: 'unirse', partidaId: id }));
    await esperar(() => m.recibidos.some((x) => x.tipo === 'vista'));
    l.ws.send(JSON.stringify({ accion: 'iniciar', partidaId: id }));
    await esperar(() => l.recibidos.some((x) => x.vista?.tuMano.length === 10));

    const l2 = await abrir(puerto, idLu);                      // otra pestaña / recarga: no recuerda la partida
    l2.ws.send(JSON.stringify({ accion: 'mias' }));
    await esperar(() => l2.recibidos.some((x) => x.tipo === 'mias'));
    const mias = (l2.recibidos.find((x) => x.tipo === 'mias') as unknown as { partidas: { id: string; estado: string }[] }).partidas;
    expect(mias).toEqual([expect.objectContaining({ id, estado: 'EN_CURSO' })]);

    const extra = await abrir(puerto, await registrar(puerto, 'Zed'));
    extra.ws.send(JSON.stringify({ accion: 'mias' }));
    await esperar(() => extra.recibidos.some((x) => x.tipo === 'mias'));
    expect((extra.recibidos[0] as unknown as { partidas: unknown[] }).partidas).toEqual([]);
    for (const c of [l, m, l2, extra]) c.ws.close();
  });
});
