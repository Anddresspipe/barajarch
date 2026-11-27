export type Manejador<T> = (evento: T) => void;

export interface EventoDominio {
  readonly tipo: string;
  readonly partidaId: string;
}

export class BusEventos {
  private readonly manejadores: Manejador<EventoDominio>[] = [];

  suscribir(m: Manejador<EventoDominio>): void {
    this.manejadores.push(m);
  }

  publicar(e: EventoDominio): void {
    for (const m of this.manejadores) m(e);
  }
}
