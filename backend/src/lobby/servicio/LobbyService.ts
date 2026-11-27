import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { IUsuarioRepository, Usuario } from '../repositorio/UsuarioRepository';
import { PartidaService } from '../../partidas/servicio/PartidaService';
import { ErrorDominio } from '../../compartido/tipos';

const derivar = promisify(scrypt) as (pin: string, sal: string, largo: number) => Promise<Buffer>;

const MAX_USUARIOS = 5000;   // el registro es abierto y vive en memoria: sin tope, cualquiera podria llenarlo
const MAX_SESIONES = 20000;
const FORMATO_PIN = /^[0-9]{4,8}$/;
const MAX_FALLOS = 5;               // intentos de PIN seguidos antes de bloquear ese nombre
const BLOQUEO_MS = 60_000;

/** Quien esta detras de una conexion: `id` es su identidad en las partidas; el cliente solo conoce su ficha de sesion. */
export interface Identidad { id: string; nombre: string }

export class LobbyService {
  private readonly sesiones = new Map<string, Identidad>();   // ficha de sesion -> quien es (en memoria: un reinicio cierra las sesiones, no las cuentas)
  private readonly fallos = new Map<string, { n: number; hasta: number }>();

  constructor(private readonly usuarios: IUsuarioRepository, private readonly partidas: PartidaService) {}

  /**
   * Entrar con nombre + PIN. Un nombre nuevo se registra con ese PIN; uno existente solo entra con su PIN,
   * y asi recupera su identidad (y con ella sus partidas) desde cualquier navegador.
   * Devuelve una ficha de sesion nueva: la identidad real no viaja nunca al cliente.
   */
  async entrar(nombre: unknown, pin: unknown): Promise<{ id: string; nombre: string }> {
    if (typeof nombre !== 'string') throw new ErrorDominio('NOMBRE_INVALIDO', 'Nombre de 2 a 20 caracteres');
    const limpio = nombre.trim();
    if (limpio.length < 2 || limpio.length > 20) throw new ErrorDominio('NOMBRE_INVALIDO', 'Nombre de 2 a 20 caracteres');
    if (typeof pin !== 'string' || !FORMATO_PIN.test(pin)) throw new ErrorDominio('PIN_INVALIDO', 'El PIN son de 4 a 8 dígitos');
    const existente = await this.usuarios.buscarPorNombre(limpio);
    const usuario = existente ? await this.verificar(existente, pin) : await this.registrar(limpio, pin);
    return { id: this.abrirSesion(usuario), nombre: usuario.nombre };
  }

  private async registrar(nombre: string, pin: string): Promise<Usuario> {
    if (await this.usuarios.cantidad() >= MAX_USUARIOS) throw new ErrorDominio('SERVIDOR_LLENO', 'Demasiados usuarios registrados, intenta más tarde');
    const sal = randomBytes(16).toString('hex');
    const u = { id: randomUUID(), nombre, sal, huella: (await derivar(pin, sal, 32)).toString('hex') };
    await this.usuarios.guardar(u);
    return u;
  }

  private async verificar(u: Usuario, pin: string): Promise<Usuario> {
    const f = this.fallos.get(u.id);
    if (f && f.n >= MAX_FALLOS && Date.now() < f.hasta) throw new ErrorDominio('DEMASIADOS_INTENTOS', 'Demasiados intentos, espera un minuto');
    const calculada = await derivar(pin, u.sal, 32);
    if (!timingSafeEqual(calculada, Buffer.from(u.huella, 'hex'))) {
      this.fallos.set(u.id, { n: (f && Date.now() < f.hasta ? f.n : 0) + 1, hasta: Date.now() + BLOQUEO_MS });
      throw new ErrorDominio('PIN_INCORRECTO', 'Ese nombre ya existe y el PIN no coincide');
    }
    this.fallos.delete(u.id);
    return u;
  }

  private abrirSesion(u: Usuario): string {
    if (this.sesiones.size >= MAX_SESIONES) this.sesiones.delete(this.sesiones.keys().next().value as string);   // la mas antigua
    const ficha = randomUUID();
    this.sesiones.set(ficha, { id: u.id, nombre: u.nombre });
    return ficha;
  }

  /** Una ficha es valida solo si la emitio entrar(): es lo que autentica la conexion WebSocket. */
  identidadDeSesion(ficha: string): Identidad | undefined { return this.sesiones.get(ficha); }
}
