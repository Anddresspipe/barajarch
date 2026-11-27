/** `id` es la identidad estable (la que figura en las partidas); nunca sale del servidor. */
export interface Usuario { id: string; nombre: string; sal: string; huella: string }

export interface IUsuarioRepository {
  guardar(u: Usuario): Promise<void>;
  buscarPorNombre(nombre: string): Promise<Usuario | undefined>;
  cantidad(): Promise<number>;
}

/** Los nombres no distinguen mayusculas: "Ana" y "ana" son la misma persona. */
export const claveDeNombre = (nombre: string): string => nombre.toLowerCase();

export class UsuarioRepositoryEnMemoria implements IUsuarioRepository {
  private readonly porNombre = new Map<string, Usuario>();
  async guardar(u: Usuario): Promise<void> { this.porNombre.set(claveDeNombre(u.nombre), u); }
  async buscarPorNombre(nombre: string): Promise<Usuario | undefined> { return this.porNombre.get(claveDeNombre(nombre)); }
  async cantidad(): Promise<number> { return this.porNombre.size; }
}
