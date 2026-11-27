import { Palo, Valor, PALOS, VALORES, COMODIN, ErrorDominio } from '../compartido/tipos';

/** Un comodin suelto en la mano penaliza mucho: no sale gratis guardarlo. */
export const PUNTOS_COMODIN = 15;

export class Carta {
  constructor(public readonly valor: Valor, public readonly palo: Palo) {}

  /** A=1 ... K=13 */
  rango(): number {
    return VALORES.indexOf(this.valor) + 1;
  }

  esComodin(): boolean {
    return this.valor === COMODIN;
  }

  /** Puntos de penalizacion: As=1 (supuesto), figuras=10. */
  puntos(): number {
    if (this.esComodin()) return PUNTOS_COMODIN;
    return Math.min(this.rango(), 10);
  }

  codigo(): string {
    return `${this.valor}${this.palo}`;
  }

  static desde(codigo: string): Carta {
    const palo = PALOS.find((p) => p === codigo.slice(-1));
    const valor = codigo.slice(0, -1) === COMODIN ? COMODIN : VALORES.find((v) => v === codigo.slice(0, -1));
    if (!palo || !valor) throw new ErrorDominio('CARTA_INVALIDA', `Carta invalida: ${codigo}`);
    return new Carta(valor, palo);
  }
}

export const crearBaraja = (conComodines = false): Carta[] => {
  const baraja = PALOS.flatMap((p) => VALORES.map((v) => new Carta(v, p)));
  return conComodines ? baraja.concat(PALOS.map((p) => new Carta(COMODIN, p))) : baraja;
};

export const manoDesde = (texto: string): Carta[] =>
  texto.trim().split(/\s+/).filter(Boolean).map(Carta.desde);
