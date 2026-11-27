import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { PartidaController, Comando } from './PartidaController';
import { Presencia } from '../../compartido/Presencia';
import { BusEventos } from '../../compartido/BusEventos';
import { ErrorDominio, describirError } from '../../compartido/tipos';

interface Sesion { vivo: boolean; jugadorId: string; nombre: string; partidaId?: string; ventanaInicio: number; mensajes: number }

/** Resuelve la ficha de sesion de la URL en la identidad del jugador, o undefined si no es valida. Lo implementa quien compone la app. */
export type Autenticador = (ficha: string) => { id: string; nombre: string } | undefined;

export const CODIGO_NO_AUTORIZADO = 4001;
export const CODIGO_DEMASIADOS_MENSAJES = 1008;
const TAMANO_MAXIMO_MENSAJE = 4096;   // bytes: ningun comando legitimo se acerca (ws admite 100 MiB por defecto)
const CAMPOS_TEXTO = ['accion', 'partidaId', 'modalidad', 'carta', 'origen', 'valor'] as const;

export class PartidaGateway {
  private readonly sesiones = new Map<WebSocket, Sesion>();

  constructor(
    server: Server,
    private readonly ctrl: PartidaController,
    bus: BusEventos,
    private readonly autenticar: Autenticador,
    private readonly presencia: Presencia,
    private readonly maxMensajesPorSegundo = Number(process.env.MAX_MENSAJES_SEG ?? 50),
    private readonly pingMs = 15_000,
  ) {
    presencia.rastrear();
    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: TAMANO_MAXIMO_MENSAJE });
    wss.on('connection', (ws, req) => this.alConectar(ws, req.url ?? ''));
    const latido = setInterval(() => this.latir(), pingMs);
    latido.unref();
    wss.on('close', () => clearInterval(latido));
    bus.suscribir((e) => { this.difundir(e.partidaId).catch((err) => console.error('difusion fallida', err)); });
  }

  private alConectar(ws: WebSocket, url: string): void {
    const identidad = this.autenticar(new URL(url, 'http://x').searchParams.get('jugador') ?? '');
    if (!identidad) { ws.close(CODIGO_NO_AUTORIZADO, 'no autorizado'); return; }
    this.presencia.conectar(identidad.id);
    this.sesiones.set(ws, { vivo: true, jugadorId: identidad.id, nombre: identidad.nombre, ventanaInicio: Date.now(), mensajes: 0 });
    ws.on('message', (data) => { this.alMensaje(ws, data.toString()).catch((err) => console.error('mensaje fallido', err)); });
    // Sin este manejador, un error de protocolo de UN cliente (p. ej. mensaje demasiado grande) tumba todo el proceso
    ws.on('error', (e) => console.warn('conexion cerrada por error de protocolo:', e.message));
    ws.on('pong', () => { const s = this.sesiones.get(ws); if (s) s.vivo = true; });
    ws.on('close', () => { this.sesiones.delete(ws); this.presencia.desconectar(identidad.id); });
  }

  /** Latido: quien no respondio al ping anterior tiene la conexion muerta (sin cierre limpio) y se corta para que cuente como desconectado. */
  private latir(): void {
    for (const [ws, s] of this.sesiones) {
      if (!s.vivo) { ws.terminate(); continue; }
      s.vivo = false;
      ws.ping();
    }
  }

  private async alMensaje(ws: WebSocket, texto: string): Promise<void> {
    const s = this.sesiones.get(ws);
    if (!s) return;
    if (this.excedeLimite(s)) { ws.close(CODIGO_DEMASIADOS_MENSAJES, 'demasiados mensajes'); return; }
    try {
      const cmd = this.leerComando(texto);
      cmd.nombre = s.nombre;   // el nombre es el registrado: el cliente no lo elige
      if (cmd.accion === 'salir') {
        s.partidaId = undefined;
        this.enviar(ws, { tipo: 'salio' });
        return;
      }
      if (cmd.accion === 'historial') {
        this.enviar(ws, { tipo: 'historial', historial: await this.ctrl.historial(s.jugadorId) });
        return;
      }
      if (cmd.accion === 'mias') {
        this.enviar(ws, { tipo: 'mias', partidas: await this.ctrl.misPartidas(s.jugadorId) });
        return;
      }
      if (cmd.accion === 'abandonar') s.partidaId = undefined;   // antes de actuar: la difusion que provoca su propia salida no debe llegarle
      const vista = await this.ctrl.manejar(s.jugadorId, cmd);
      if (cmd.accion !== 'abandonar') s.partidaId = vista.id;
      this.enviar(ws, cmd.accion === 'abandonar' ? { tipo: 'salio' } : { tipo: 'vista', vista });
    } catch (e) {
      const { codigo, mensaje } = describirError(e);
      this.enviar(ws, { tipo: 'error', codigo, mensaje });
    }
  }

  /** Ventana de un segundo por conexion: corta a quien inunda al servidor sin molestar a un jugador real. */
  private excedeLimite(s: Sesion): boolean {
    const ahora = Date.now();
    if (ahora - s.ventanaInicio >= 1000) { s.ventanaInicio = ahora; s.mensajes = 0; }
    return ++s.mensajes > this.maxMensajesPorSegundo;
  }

  private leerComando(texto: string): Comando {
    try {
      const cmd: unknown = JSON.parse(texto);
      if (typeof cmd === 'object' && cmd !== null && !Array.isArray(cmd) && typeof (cmd as Comando).accion === 'string') {
        const c = cmd as Record<string, unknown>;
        // Los campos de texto, si vienen (null = ausente, como lo manda el cliente), deben ser texto: ningun caso de uso espera objetos ni numeros ahi
        if (CAMPOS_TEXTO.every((k) => c[k] == null || typeof c[k] === 'string')) return c as unknown as Comando;
      }
    } catch { /* cae al error de dominio de abajo */ }
    throw new ErrorDominio('MENSAJE_INVALIDO', 'Mensaje inválido');
  }

  /** El socket pudo cerrarse mientras se esperaba al servicio: enviar a uno cerrado lanza. */
  private enviar(ws: WebSocket, mensaje: object): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(mensaje));
  }

  private async difundir(partidaId: string): Promise<void> {
    for (const [ws, s] of this.sesiones) {
      if (s.partidaId !== partidaId) continue;
      try {
        this.enviar(ws, { tipo: 'vista', vista: await this.ctrl.vista(partidaId, s.jugadorId) });
      } catch (e) {
        console.error('no se pudo enviar la vista a un jugador', e);   // un fallo no debe dejar sin actualizar a los demas
      }
    }
  }
}
