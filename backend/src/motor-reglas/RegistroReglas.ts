import { ReglaJuego, IRegistroReglas } from './ReglaJuego';
import { ErrorDominio } from '../compartido/tipos';

export class RegistroReglas implements IRegistroReglas {
  private readonly reglas = new Map<string, ReglaJuego>();

  registrar(regla: ReglaJuego): this {
    this.reglas.set(regla.getCodigo(), regla);
    return this;
  }

  obtener(codigo: string): ReglaJuego {
    const r = this.reglas.get(codigo);
    if (!r) throw new ErrorDominio('MODALIDAD_DESCONOCIDA', `Modalidad no registrada: ${codigo}`);
    return r;
  }

  codigos(): string[] {
    return [...this.reglas.keys()];
  }
}
