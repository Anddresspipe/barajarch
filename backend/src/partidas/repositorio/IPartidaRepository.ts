import { Partida, CierreRonda, EstadoPartida } from '../modelo/Partida';

export interface IPartidaRepository {
  guardar(p: Partida): Promise<void>;
  cargar(id: string): Promise<Partida | undefined>;
  listarPorEstado(estado: EstadoPartida): Promise<Partida[]>;
  /** Partidas sin terminar en las que participa el jugador (para que pueda volver a ellas). */
  listarDeJugador(jugadorId: string): Promise<Partida[]>;
  /** Partidas terminadas en las que participo el jugador, de la mas reciente a la mas antigua (hasta `limite`). */
  listarTerminadasDeJugador(jugadorId: string, limite: number): Promise<Partida[]>;
  /** Cierre de ronda atomico: marcador + snapshot en una sola transaccion. */
  guardarCierreRonda(c: CierreRonda): Promise<void>;
}
