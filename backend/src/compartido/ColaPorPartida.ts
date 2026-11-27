/** Serializa las operaciones de una misma partida (ADR-05). */
export class ColaPorPartida {
  private readonly colas = new Map<string, Promise<void>>();

  ejecutar<T>(partidaId: string, tarea: () => Promise<T>): Promise<T> {
    const previa = this.colas.get(partidaId) ?? Promise.resolve();
    const resultado = previa.then(tarea);
    const cola = resultado.then(() => undefined, () => undefined);
    this.colas.set(partidaId, cola);
    // Sin esto el mapa crece con cada partida que existio
    void cola.then(() => { if (this.colas.get(partidaId) === cola) this.colas.delete(partidaId); });
    return resultado;
  }
}
