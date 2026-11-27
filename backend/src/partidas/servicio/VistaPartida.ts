import { createHash } from 'crypto';
import { Partida, ResumenCierre } from '../modelo/Partida';

/** Identificador publico: el id real funciona como credencial y nunca se expone. */
export const idPublico = (id: string): string => createHash('sha256').update(id).digest('hex').slice(0, 8);

export interface VistaPartida {
  id: string; version: number; modalidad: string; comodines: boolean; estado: string; ronda: number; fase: string;
  yo: string; turnoDe: string; tuMano: string[]; pozoTope: string | null; cartasMazo: number;
  jugadores: { id: string; nombre: string; cartas: number; acumulado: number; eliminado: boolean; abandono?: boolean; conectado: boolean; reverso?: string; ultimoDescarte?: string }[];
  /** El pozo se barajo para formar un mazo nuevo en la jugada mas reciente. */
  barajado?: boolean;
  /** Como termino la partida si fue por abandono. */
  fin?: string;
  /** Milisegundos que le quedan al turno actual; ausente si no hay limite de tiempo. */
  turnoRestanteMs?: number;
  /** Ultima jugada hecha por el sistema por tiempo agotado (solo mientras sea la jugada mas reciente). */
  auto?: { jugadorId: string; expulsado: boolean };
  ganadorId?: string; ultimoCierre?: ResumenCierre;
  /** Solo para quien tiene el turno de descartar: si puede cerrar ya y, si no, que le falta. */
  /** Sala de revancha con puntos por heredar: cuantos aceptan conservarlos. */
  herencia?: { aceptan: number; total: number };
  /** Partida terminada: modalidades a las que se pueden llevar los puntos. */
  traspasables?: string[];
}

/** Datos de la vista que dependen de las reglas o del servicio, no solo de la partida. */
export type ExtrasVista = Pick<VistaPartida, 'herencia' | 'traspasables'>;

const conIdPublico = <T>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).map(([id, v]) => [idPublico(id), v]));

const cierrePublico = (c: ResumenCierre): ResumenCierre => ({
  ronda: c.ronda, cierraId: idPublico(c.cierraId), deltas: conIdPublico(c.deltas), manos: conIdPublico(c.manos),
});

const restante = (p: Partida): number | undefined =>
  p.turnoLimite !== undefined && p.estado === 'EN_CURSO' ? Math.max(0, p.turnoLimite - Date.now()) : undefined;

const autoPublica = (p: Partida): VistaPartida['auto'] =>
  p.ultimaAuto && p.ultimaAuto.version === p.version
    ? { jugadorId: idPublico(p.ultimaAuto.jugadorId), expulsado: p.ultimaAuto.expulsado } : undefined;

/** Proyeccion por jugador: nunca expone manos ajenas. */
export function vistaPara(p: Partida, jugadorId: string, extras: ExtrasVista = {}, conectados: ReadonlySet<string> | null = null): VistaPartida {
  const yo = p.jugadores.find((j) => j.id === jugadorId);
  return {
    id: p.id, version: p.version, modalidad: p.modalidad, comodines: p.comodines === true, estado: p.estado, ronda: p.ronda, fase: p.fase,
    yo: idPublico(jugadorId),
    turnoDe: p.jugadores[p.turno] ? idPublico(p.jugadores[p.turno].id) : '',
    tuMano: yo ? yo.mano.map((c) => c.codigo()) : [],
    pozoTope: p.pozo.length ? p.pozo[p.pozo.length - 1].codigo() : null,
    cartasMazo: p.mazo.length,
    jugadores: p.jugadores.map((j) => ({
      id: idPublico(j.id), nombre: j.nombre, cartas: j.mano.length, acumulado: j.acumulado, eliminado: j.eliminado, abandono: j.abandono, conectado: conectados === null || conectados.has(j.id), reverso: j.reverso, ultimoDescarte: j.ultimoDescarte,
    })),
    turnoRestanteMs: restante(p),
    barajado: p.barajadoEn === p.version && p.estado === 'EN_CURSO' ? true : undefined,
    fin: p.fin,
    auto: autoPublica(p),
    ganadorId: p.ganadorId ? idPublico(p.ganadorId) : undefined,
    ultimoCierre: p.ultimoCierre ? cierrePublico(p.ultimoCierre) : undefined,
    ...extras,
  };
}
