import { Pool } from 'pg';
import { IUsuarioRepository, Usuario, claveDeNombre } from './UsuarioRepository';
import { ErrorDominio } from '../../compartido/tipos';

export class UsuarioRepositoryPostgres implements IUsuarioRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(u: Usuario): Promise<void> {
    // La clave unica evita que dos registros simultaneos con el mismo nombre se pisen
    const r = await this.pool.query(
      `INSERT INTO usuario (id, nombre, clave, sal, huella) VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::varchar)
       ON CONFLICT (clave) DO NOTHING`,
      [u.id, u.nombre, claveDeNombre(u.nombre), u.sal, u.huella]);
    if (r.rowCount === 0) throw new ErrorDominio('PIN_INCORRECTO', 'Ese nombre ya existe y el PIN no coincide');
  }

  async buscarPorNombre(nombre: string): Promise<Usuario | undefined> {
    const r = await this.pool.query<Usuario>('SELECT id, nombre, sal, huella FROM usuario WHERE clave = $1::varchar', [claveDeNombre(nombre)]);
    return r.rows[0];
  }

  async cantidad(): Promise<number> {
    const r = await this.pool.query<{ n: string }>('SELECT count(*) AS n FROM usuario');
    return Number(r.rows[0].n);
  }
}
