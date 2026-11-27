import { IPartidaRepository } from './IPartidaRepository';
import { Partida, CierreRonda, EstadoPartida, restaurar } from '../modelo/Partida';
import { ErrorDominio } from '../../compartido/tipos';

/** Guarda JSON, no referencias: asi se comporta igual que la base de datos (copia, sin compartir estado). */
export class PartidaRepositoryEnMemoria implements IPartidaRepository {
  private readonly partidas = new Map<string, string>();
  private readonly cierres = new Set<string>();

  async guardar(p: Partida): Promise<void> {
    this.partidas.set(p.id, JSON.stringify(p));
  }

  async cargar(id: string): Promise<Partida | undefined> {
    const s = this.partidas.get(id);
    return s ? restaurar(JSON.parse(s)) : undefined;
  }

  async listarPorEstado(estado: EstadoPartida): Promise<Partida[]> {
    return [...this.partidas.values()].map((s) => restaurar(JSON.parse(s))).filter((p) => p.estado === estado);
  }

  async listarDeJugador(jugadorId: string): Promise<Partida[]> {
    return [...this.partidas.values()].map((s) => restaurar(JSON.parse(s)))
      .filter((p) => p.estado !== 'FINALIZADA' && p.jugadores.some((j) => j.id === jugadorId));
  }

  async listarTerminadasDeJugador(jugadorId: string, limite: number): Promise<Partida[]> {
    return [...this.partidas.values()].map((s) => restaurar(JSON.parse(s)))
      .filter((p) => p.estado === 'FINALIZADA' && p.jugadores.some((j) => j.id === jugadorId)).reverse().slice(0, limite);
  }

  async guardarCierreRonda(c: CierreRonda): Promise<void> {
    const clave = `${c.partidaId}:${c.ronda}`;
    if (this.cierres.has(clave)) throw new ErrorDominio('RONDA_YA_CERRADA', 'La ronda ya fue cerrada');
    this.cierres.add(clave);
    await this.guardar(c.snapshot);
  }
}
