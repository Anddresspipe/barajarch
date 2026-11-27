import { Pool, PoolClient } from 'pg';
import { IPartidaRepository } from './IPartidaRepository';
import { Partida, PartidaPlana, CierreRonda, EstadoPartida, restaurar } from '../modelo/Partida';
import { ErrorDominio } from '../../compartido/tipos';

const UPSERT_PARTIDA = `
  INSERT INTO partida (id, modalidad, estado, version, snapshot)
  VALUES ($1::varchar, $2::varchar, $3::varchar, $4::int, $5::jsonb)
  ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, version = EXCLUDED.version, snapshot = EXCLUDED.snapshot`;

const valores = (p: Partida): unknown[] => [p.id, p.modalidad, p.estado, p.version, JSON.stringify(p)];

export class PartidaRepositoryPostgres implements IPartidaRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(p: Partida): Promise<void> {
    await this.pool.query(UPSERT_PARTIDA, valores(p));
  }

  async cargar(id: string): Promise<Partida | undefined> {
    const r = await this.pool.query<{ snapshot: PartidaPlana }>('SELECT snapshot FROM partida WHERE id = $1::varchar', [id]);
    return r.rows[0] ? restaurar(r.rows[0].snapshot) : undefined;
  }

  async listarPorEstado(estado: EstadoPartida): Promise<Partida[]> {
    const r = await this.pool.query<{ snapshot: PartidaPlana }>(
      'SELECT snapshot FROM partida WHERE estado = $1::varchar ORDER BY creada_en', [estado]);
    return r.rows.map((x) => restaurar(x.snapshot));
  }

  async listarDeJugador(jugadorId: string): Promise<Partida[]> {
    const r = await this.pool.query<{ snapshot: PartidaPlana }>(
      `SELECT snapshot FROM partida WHERE estado <> 'FINALIZADA' AND snapshot->'jugadores' @> $1::jsonb ORDER BY creada_en`,
      [JSON.stringify([{ id: jugadorId }])]);
    return r.rows.map((x) => restaurar(x.snapshot));
  }

  async listarTerminadasDeJugador(jugadorId: string, limite: number): Promise<Partida[]> {
    const r = await this.pool.query<{ snapshot: PartidaPlana }>(
      `SELECT snapshot FROM partida WHERE estado = 'FINALIZADA' AND snapshot->'jugadores' @> $1::jsonb
       ORDER BY creada_en DESC LIMIT $2::int`,
      [JSON.stringify([{ id: jugadorId }]), limite]);
    return r.rows.map((x) => restaurar(x.snapshot));
  }

  async guardarCierreRonda(c: CierreRonda): Promise<void> {
    await this.enTransaccion(async (cx) => {
      const ins = await cx.query(
        `INSERT INTO ronda_cierre (partida_id, ronda, cierra_id, deltas)
         VALUES ($1::varchar, $2::int, $3::varchar, $4::jsonb) ON CONFLICT (partida_id, ronda) DO NOTHING`,
        [c.partidaId, c.ronda, c.cierraId, JSON.stringify(c.deltas)],
      );
      if (ins.rowCount === 0) throw new ErrorDominio('RONDA_YA_CERRADA', 'La ronda ya fue cerrada');
      await cx.query(UPSERT_PARTIDA, valores(c.snapshot));
    });
  }

  private async enTransaccion(trabajo: (cx: PoolClient) => Promise<void>): Promise<void> {
    const cx = await this.pool.connect();
    try {
      await cx.query('BEGIN');
      await trabajo(cx);
      await cx.query('COMMIT');
    } catch (e) {
      await cx.query('ROLLBACK');
      throw e;
    } finally {
      cx.release();
    }
  }
}
