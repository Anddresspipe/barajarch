/* Prueba de mutacion: cada violacion deliberada DEBE hacer fallar las fitness functions.
   Es TypeScript (no .sh) para que corra igual en Windows, macOS y Linux. */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'fs';

const hayFallo = (): boolean =>
  spawnSync('npx', ['jest', 'tests/architecture'], { shell: true, stdio: 'ignore' }).status !== 0;

const violaciones = [
  { nombre: 'Prueba 1 - plug-in Apuntado importa plug-in Clasica', archivo: 'src/motor-reglas/plugins/ReglaApuntado101.ts',
    codigo: "import { ReglaClasicaCuartaTerna } from './ReglaClasicaCuartaTerna'; export const _x = ReglaClasicaCuartaTerna;" },
  { nombre: 'Prueba 2 - controlador importa repositorio', archivo: 'src/partidas/controlador/Violacion.ts',
    codigo: "import { PartidaRepositoryEnMemoria } from '../repositorio/PartidaRepositoryEnMemoria'; export const _y = PartidaRepositoryEnMemoria;" },
  { nombre: 'Prueba 3 - ciclo motor-reglas <-> partidas', archivo: 'src/motor-reglas/Ciclo.ts',
    codigo: "import { PartidaService } from '../partidas/servicio/PartidaService'; export const _z = PartidaService;" },
  { nombre: 'Literal de modalidad fuera del plug-in', archivo: 'src/partidas/servicio/Literal.ts',
    codigo: "export const _m = 'CLASICA';" },
];

let fallos = 0;
for (const v of violaciones) {
  const original = existsSync(v.archivo) ? readFileSync(v.archivo, 'utf8') : null;
  try {
    appendFileSync(v.archivo, `${v.codigo}\n`);
    const detectada = hayFallo();
    console.log(`${detectada ? 'detectada:   ' : 'NO DETECTADA:'} ${v.nombre}`);
    if (!detectada) fallos++;
  } finally {
    if (original === null) rmSync(v.archivo, { force: true }); else writeFileSync(v.archivo, original);   // siempre se restaura
  }
}
if (hayFallo()) { console.log('ERROR: el estado limpio esta en rojo'); fallos++; } else console.log('estado limpio: fitness functions en verde');
process.exit(fallos === 0 ? 0 : 1);
