type Oyente = (jugadorId: string, conectado: boolean) => void;

/**
 * Quien tiene al menos una conexion abierta. La alimenta el transporte (WebSocket) y la consulta el
 * servicio de partidas; ninguno conoce al otro. Mientras nadie la alimenta (`rastrear()` sin llamar,
 * como en las pruebas del servicio) se asume que todos estan presentes: no hay forma de saber lo contrario.
 */
export class Presencia {
  private readonly conexiones = new Map<string, number>();
  private readonly oyentes: Oyente[] = [];
  private activa = false;

  rastrear(): void { this.activa = true; }
  alCambiar(oyente: Oyente): void { this.oyentes.push(oyente); }

  conectar(id: string): void {
    const n = (this.conexiones.get(id) ?? 0) + 1;
    this.conexiones.set(id, n);
    if (n === 1) this.avisar(id, true);
  }

  desconectar(id: string): void {
    const n = (this.conexiones.get(id) ?? 0) - 1;
    if (n > 0) { this.conexiones.set(id, n); return; }
    this.conexiones.delete(id);
    this.avisar(id, false);
  }

  estaConectado(id: string): boolean { return !this.activa || this.conexiones.has(id); }
  hayAlguien(ids: readonly string[]): boolean { return ids.some((id) => this.estaConectado(id)); }

  private avisar(id: string, conectado: boolean): void {
    for (const o of this.oyentes) o(id, conectado);
  }
}
