import { PartidaService } from '../servicio/PartidaService';
import { vistaPara, VistaPartida } from '../servicio/VistaPartida';
import { ErrorDominio } from '../../compartido/tipos';
import { HistorialJugador } from '../servicio/Historial';
import { Partida } from '../modelo/Partida';

export interface Comando {
  accion: string; partidaId?: string; modalidad?: string; nombre?: string;
  origen?: 'MAZO' | 'POZO'; carta?: string; ronda?: number; codigos?: unknown; conservar?: boolean; valor?: string; comodines?: boolean;
}

type Accion = (jugadorId: string, c: Comando) => Promise<Partida>;

/** Traduce comandos (WebSocket) a casos de uso. No conoce persistencia ni transporte. */
export class PartidaController {
  private readonly acciones: Record<string, Accion>;

  constructor(private readonly servicio: PartidaService) {
    const id = (c: Comando): string => c.partidaId ?? '';
    this.acciones = {
      crear: (j, c) => servicio.crear(c.modalidad ?? '', j, c.nombre ?? j, c.comodines === true),
      unirse: (j, c) => servicio.unirse(id(c).trim().toUpperCase(), j, c.nombre ?? j),   // el codigo se escribe a mano: sin importar mayusculas
      iniciar: (j, c) => servicio.iniciar(id(c), j),
      robar: (j, c) => servicio.robar(id(c), j, c.origen ?? 'MAZO'),
      descartar: (j, c) => servicio.descartar(id(c), j, c.carta ?? ''),
      cerrar: (j, c) => servicio.cerrarRonda(id(c), j, c.ronda ?? -1),
      revancha: (j, c) => servicio.revancha(id(c), j, c.modalidad ?? '', c.conservar === true),
      reverso: (j, c) => servicio.cambiarReverso(id(c), j, c.valor),
      orden: (j, c) => servicio.registrarOrden(id(c), j, c.codigos),
      abandonar: (j, c) => servicio.abandonar(id(c), j),
      estado: (j, c) => servicio.obtenerComoJugador(id(c), j),
    };
  }

  async manejar(jugadorId: string, c: Comando): Promise<VistaPartida> {
    const accion = this.acciones[c.accion];
    if (!accion) throw new ErrorDominio('ACCION_DESCONOCIDA', `Acción desconocida: ${c.accion}`);
    return this.proyectar(await accion(jugadorId, c), jugadorId);
  }

  /** Resumen de las partidas sin terminar de un jugador, para que pueda retomarlas. */
  async misPartidas(jugadorId: string): Promise<{ id: string; modalidad: string; estado: string; jugadores: string[] }[]> {
    return (await this.servicio.partidasDe(jugadorId)).map((p) => ({
      id: p.id, modalidad: p.modalidad, estado: p.estado, jugadores: p.jugadores.map((j) => j.nombre),
    }));
  }

  historial(jugadorId: string): Promise<HistorialJugador> { return this.servicio.historialDe(jugadorId); }

  async vista(partidaId: string, jugadorId: string): Promise<VistaPartida> {
    return this.proyectar(await this.servicio.obtener(partidaId), jugadorId);
  }

  private proyectar(p: Partida, jugadorId: string): VistaPartida {
    return vistaPara(p, jugadorId, {
      herencia: this.servicio.herenciaPendiente(p),
      traspasables: p.estado === 'FINALIZADA' ? this.servicio.traspasables(p) : undefined,
    }, this.servicio.conectadosDe(p));
  }
}
