import { IncomingMessage, ServerResponse } from 'http';
import { LobbyService } from '../servicio/LobbyService';
import { ErrorDominio, describirError } from '../../compartido/tipos';
import { CABECERAS_SEGURIDAD } from '../../compartido/seguridad';

const LIMITE_CUERPO = 4096;

function leerJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((ok, fallo) => {
    let buf = '';
    req.on('data', (d) => {
      buf += d;
      if (buf.length > LIMITE_CUERPO) { req.destroy(); fallo(new ErrorDominio('CUERPO_INVALIDO', 'Cuerpo demasiado grande')); }
    });
    req.on('end', () => {
      try {
        const cuerpo: unknown = buf ? JSON.parse(buf) : {};
        if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) throw new Error('no es un objeto');
        ok(cuerpo as Record<string, unknown>);
      } catch { fallo(new ErrorDominio('CUERPO_INVALIDO', 'JSON inválido')); }
    });
  });
}

type Ruta = (req: IncomingMessage) => Promise<{ estado: number; cuerpo: unknown }>;

export class LobbyController {
  private readonly rutas: Record<string, Ruta>;

  constructor(private readonly lobby: LobbyService) {
    this.rutas = {
      'POST /api/usuarios': async (req) => {
        const c = await leerJson(req);
        return { estado: 201, cuerpo: await this.lobby.entrar(c.nombre, c.pin) };
      },
      'GET /api/salud': async () => ({ estado: 200, cuerpo: { ok: true } }),
    };
  }

  /** Devuelve true si la ruta fue atendida. */
  async manejar(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const ruta = this.rutas[`${req.method} ${req.url}`];
    if (!ruta) return false;
    try {
      const r = await ruta(req);
      return this.json(res, r.estado, r.cuerpo);
    } catch (e) {
      const { esDominio, ...cuerpo } = describirError(e);
      return this.json(res, esDominio ? 400 : 500, cuerpo);
    }
  }

  private json(res: ServerResponse, estado: number, cuerpo: unknown): boolean {
    res.writeHead(estado, { ...CABECERAS_SEGURIDAD, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(cuerpo));
    return true;
  }
}
