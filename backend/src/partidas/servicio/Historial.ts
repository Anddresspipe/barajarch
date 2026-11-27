import { Partida } from '../modelo/Partida';

export interface Conteo { jugadas: number; ganadas: number; ganadasPorAbandono: number; perdidas: number; abandonadas: number }
export type Resultado = 'GANADA' | 'GANADA_POR_ABANDONO' | 'PERDIDA' | 'ABANDONADA';
export interface PartidaJugada { id: string; modalidad: string; resultado: Resultado; rondas: number; rivales: string[] }
export interface HistorialJugador { porModalidad: Record<string, Conteo>; recientes: PartidaJugada[] }

/**
 * Como le fue a un jugador en una partida terminada:
 * - si se fueron todos, derrota para todos;
 * - quien se fue (o fue sacado por inactividad) la deja como abandonada: cuenta como jugada, ni gana ni pierde;
 * - quien gana porque los demas se fueron suma una victoria aparte;
 * - el resto gana o pierde por puntos.
 */
export function resultadoDe(p: Partida, jugadorId: string): Resultado {
  if (p.fin === 'ABANDONO_TOTAL') return 'PERDIDA';
  if (p.jugadores.find((j) => j.id === jugadorId)?.abandono) return 'ABANDONADA';
  if (p.ganadorId !== jugadorId) return 'PERDIDA';
  return p.fin === 'ABANDONO' ? 'GANADA_POR_ABANDONO' : 'GANADA';
}

const vacio = (): Conteo => ({ jugadas: 0, ganadas: 0, ganadasPorAbandono: 0, perdidas: 0, abandonadas: 0 });

function sumar(c: Conteo, r: Resultado): void {
  c.jugadas++;
  if (r === 'GANADA') c.ganadas++;
  else if (r === 'GANADA_POR_ABANDONO') c.ganadasPorAbandono++;
  else if (r === 'PERDIDA') c.perdidas++;
  else c.abandonadas++;
}

/** `terminadas` llega de la mas reciente a la mas antigua. Una partida que nunca llego a repartirse no cuenta. */
export function armarHistorial(terminadas: readonly Partida[], jugadorId: string, modalidades: readonly string[], recientes = 10): HistorialJugador {
  const porModalidad: Record<string, Conteo> = Object.fromEntries(modalidades.map((m) => [m, vacio()]));
  const jugadas = terminadas.filter((p) => p.ronda >= 1);
  const lista: PartidaJugada[] = [];
  for (const p of jugadas) {
    const r = resultadoDe(p, jugadorId);
    sumar(porModalidad[p.modalidad] ??= vacio(), r);
    if (lista.length < recientes) {
      lista.push({ id: p.id, modalidad: p.modalidad, resultado: r, rondas: p.ronda,
        rivales: p.jugadores.filter((j) => j.id !== jugadorId).map((j) => j.nombre) });
    }
  }
  return { porModalidad, recientes: lista };
}
