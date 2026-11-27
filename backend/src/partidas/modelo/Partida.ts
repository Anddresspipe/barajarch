import { Carta } from '../../motor-reglas/Carta';

export type EstadoPartida = 'ESPERANDO' | 'EN_CURSO' | 'FINALIZADA';
export type FaseTurno = 'ROBAR' | 'DESCARTAR';

export interface Jugador {
  id: string;
  nombre: string;
  mano: Carta[];
  acumulado: number;
  eliminado: boolean;
  /** Diseño del reverso de sus cartas: lo elige cada jugador y lo ven los demas. Opcional: partidas guardadas antes no lo tienen. */
  reverso?: string;
  /** Turnos seguidos que dejo vencer sin jugar: al llegar al tope se le saca de la partida. */
  inactividad?: number;
  /** Salio de la partida por no jugar (no por perder). */
  abandono?: boolean;
  /** Codigo de la ultima carta que descarto en la ronda en curso (es publica: todos la vieron caer al pozo). */
  ultimoDescarte?: string;
}

/** Lo que pasó en la última ronda cerrada: se conserva aunque ya se haya repartido la siguiente. */
export interface ResumenCierre {
  ronda: number;
  cierraId: string;
  deltas: Record<string, number>;
  manos: Record<string, string[]>;   // codigos de carta; las manos son publicas una vez cerrada la ronda
}

export interface Partida {
  id: string;
  modalidad: string;
  adminId: string;
  /** Se juega con los 4 comodines ademas de las 52 cartas (opcion que elige quien crea la sala). */
  comodines?: boolean;
  estado: EstadoPartida;
  jugadores: Jugador[];
  mazo: Carta[];
  pozo: Carta[];
  turno: number;
  fase: FaseTurno;
  ronda: number;
  version: number;
  ganadorId?: string;
  ultimoCierre?: ResumenCierre;
  /** Momento (ms epoch) en que vence el turno actual; ausente si no hay limite de tiempo. */
  turnoLimite?: number;
  /** Ultima jugada hecha por el sistema por tiempo agotado; `version` dice a que estado de la partida corresponde. */
  /** Como termino si no fue por un cierre normal: un jugador gano porque los demas se fueron, o se fueron todos. */
  fin?: 'ABANDONO' | 'ABANDONO_TOTAL';
  /** Version en la que se barajo el pozo para formar un mazo nuevo (para avisarlo una vez). */
  barajadoEn?: number;
  ultimaAuto?: { jugadorId: string; version: number; expulsado: boolean };
}

type Plano<T> = { [K in keyof T]: T[K] extends Carta[] ? Pick<Carta, 'valor' | 'palo'>[] : T[K] };

/** Forma serializada de una partida: las cartas pierden su clase al pasar por JSON. */
export type PartidaPlana = Omit<Plano<Partida>, 'jugadores'> & { jugadores: Plano<Jugador>[] };

const aCartas = (cs: Pick<Carta, 'valor' | 'palo'>[]): Carta[] => cs.map((c) => new Carta(c.valor, c.palo));

export function restaurar(p: PartidaPlana): Partida {
  return {
    ...p,
    mazo: aCartas(p.mazo),
    pozo: aCartas(p.pozo),
    jugadores: p.jugadores.map((j) => ({ ...j, mano: aCartas(j.mano) })),
  };
}

export interface CierreRonda {
  partidaId: string;
  ronda: number;
  cierraId: string;
  deltas: Record<string, number>;
  snapshot: Partida;
}

export const MIN_JUGADORES = 2;
export const MAX_JUGADORES = 4;
