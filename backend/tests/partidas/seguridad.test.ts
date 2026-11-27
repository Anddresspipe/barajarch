import WebSocket from 'ws';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { arrancar } from '../../src/app/main';

type Msg = { tipo: string; codigo?: string; vista?: { id: string; jugadores: { nombre: string }[] } };

async function abrir(puerto: number, jugador: string) {
  const ws = new WebSocket(`ws://localhost:${puerto}/ws?jugador=${jugador}`);
  const recibidos: Msg[] = [];
  let cierre: number | undefined;
  ws.on('message', (d) => recibidos.push(JSON.parse(d.toString())));
  ws.on('close', (c) => { cierre = c; });
  await new Promise((ok) => ws.on('open', ok));
  return { ws, recibidos, codigoCierre: () => cierre };
}
const registrar = async (puerto: number, nombre: unknown): Promise<string> => {
  const r = await fetch(`http://localhost:${puerto}/api/usuarios`, { method: 'POST', body: JSON.stringify({ nombre, pin: '1234' }) });
  return ((await r.json()) as { id: string }).id;
};
const esperar = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(cond()).toBe(true);
};

describe('Seguridad de la superficie expuesta', () => {
  let server: Server; let puerto: number;
  beforeAll(() => {
    delete process.env.DATABASE_URL;
    process.env.MAX_MENSAJES_SEG = '20';
    server = arrancar(0);
    puerto = (server.address() as AddressInfo).port;
  });
  afterAll(() => { delete process.env.MAX_MENSAJES_SEG; return new Promise<void>((ok) => server.close(() => ok())); });

  it('toda respuesta lleva CSP estricta y nosniff (pagina, API y 404)', async () => {
    for (const ruta of ['/', '/api/salud', '/no-existe']) {
      const r = await fetch(`http://localhost:${puerto}${ruta}`);
      expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });

  it('el registro rechaza nombres que no son texto y cuerpos que no son un objeto, sin caer en 500', async () => {
    for (const cuerpo of ['{"nombre":123}', '{"nombre":{"a":1}}', 'null', '[]', '"hola"', '{']) {
      const r = await fetch(`http://localhost:${puerto}/api/usuarios`, { method: 'POST', body: cuerpo });
      expect(r.status).toBe(400);
    }
  });

  it('el nombre en la partida es el registrado, no el que mande el cliente', async () => {
    const a = await abrir(puerto, await registrar(puerto, 'Ana'));
    // partidaId: null es lo que manda el cliente real al crear una sala: debe tratarse como ausente
    a.ws.send(JSON.stringify({ accion: 'crear', partidaId: null, modalidad: 'CLASICA', nombre: 'Administrador <img src=x>' }));
    await esperar(() => a.recibidos.some((m) => m.tipo === 'vista'));
    expect(a.recibidos[0].vista!.jugadores[0].nombre).toBe('Ana');
    a.ws.close();
  });

  it('quien no juega en una partida no puede consultarla ni recibir sus cambios', async () => {
    const a = await abrir(puerto, await registrar(puerto, 'Ana'));
    const intruso = await abrir(puerto, await registrar(puerto, 'Intruso'));
    a.ws.send(JSON.stringify({ accion: 'crear', modalidad: 'CLASICA' }));
    await esperar(() => a.recibidos.some((m) => m.tipo === 'vista'));
    const id = a.recibidos[0].vista!.id;
    intruso.ws.send(JSON.stringify({ accion: 'estado', partidaId: id }));
    await esperar(() => intruso.recibidos.some((m) => m.tipo === 'error'));
    expect(intruso.recibidos[0].codigo).toBe('NO_ES_JUGADOR');
    a.ws.close(); intruso.ws.close();
  });

  it('un mensaje mas grande que el limite cierra la conexion (no se acepta 100 MiB)', async () => {
    const x = await abrir(puerto, await registrar(puerto, 'Xavi'));
    x.ws.send(JSON.stringify({ accion: 'estado', relleno: 'a'.repeat(10_000) }));
    await esperar(() => x.codigoCierre() !== undefined);
    expect(x.codigoCierre()).toBe(1009);
  });

  it('los campos de texto deben ser texto', async () => {
    const x = await abrir(puerto, await registrar(puerto, 'Xavi'));
    x.ws.send(JSON.stringify({ accion: 'robar', origen: { $ne: 1 } }));
    await esperar(() => x.recibidos.some((m) => m.tipo === 'error'));
    expect(x.recibidos[0].codigo).toBe('MENSAJE_INVALIDO');
    x.ws.close();
  });

  it('inundar con mensajes corta la conexion; el uso normal no', async () => {
    const normal = await abrir(puerto, await registrar(puerto, 'Normal'));
    for (let i = 0; i < 5; i++) normal.ws.send(JSON.stringify({ accion: 'estado', partidaId: 'x' }));
    await new Promise((r) => setTimeout(r, 150));
    expect(normal.codigoCierre()).toBeUndefined();
    normal.ws.close();

    const x = await abrir(puerto, await registrar(puerto, 'Flood'));
    for (let i = 0; i < 60; i++) x.ws.send(JSON.stringify({ accion: 'estado', partidaId: 'x' }));
    await esperar(() => x.codigoCierre() !== undefined);
    expect(x.codigoCierre()).toBe(1008);
  });
});
