import { RegistroReglas } from './RegistroReglas';
import { ReglaClasicaCuartaTerna } from './plugins/ReglaClasicaCuartaTerna';
import { ReglaApuntado101 } from './plugins/ReglaApuntado101';

export const crearRegistroPorDefecto = (): RegistroReglas =>
  new RegistroReglas().registrar(new ReglaClasicaCuartaTerna()).registrar(new ReglaApuntado101());
