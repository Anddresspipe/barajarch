/* Calcula CC por funcion (via ESLint), Ca/Ce, I, A y D por modulo. Salida: tabla + docs/metricas.json */
import { ESLint } from 'eslint';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';

const SRC = 'src';
const normal = (p: string): string => p.replace(/\\/g, '/');   // Windows usa '\\'
const lista = (d: string): string[] =>
  readdirSync(d).flatMap((n) => { const r = normal(join(d, n)); return statSync(r).isDirectory() ? lista(r) : r.endsWith('.ts') ? [r] : []; });
const modulo = (f: string): string => f.split('/')[1];

const archivos = lista(SRC);
const mods = [...new Set(archivos.map(modulo))].sort();

// ---- acoplamiento ----
const aristas: { de: string; a: string }[] = [];
for (const f of archivos) {
  for (const m of readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
    const destino = normal(relative(resolve('.'), resolve(dirname(f), m[1])));
    const real = archivos.find((x) => x.replace(/\.ts$/, '') === destino);
    if (real && modulo(real) !== modulo(f)) aristas.push({ de: f, a: real });
  }
}

// ---- abstraccion ----
// Abstracta = interfaz que alguien implementa (un contrato) o clase abstracta.
// Las interfaces que solo describen datos (Jugador, Comando...) no son abstracciones y no cuentan.
const implementadas = new Set<string>();
for (const f of archivos) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\bimplements\s+([\w\s,]+?)\s*\{/g)) {
    m[1].split(',').forEach((n) => implementadas.add(n.trim()));
  }
}

function abstraccion(m: string): { abs: number; tot: number } {
  let abs = 0, tot = 0;
  for (const f of archivos.filter((x) => modulo(x) === m)) {
    const t = readFileSync(f, 'utf8');
    const interfaces = [...t.matchAll(/^export interface (\w+)/gm)].map((x) => x[1]);
    const abstractas = (t.match(/^export abstract class /gm) ?? []).length;
    const clases = (t.match(/^export class /gm) ?? []).length;
    abs += interfaces.filter((n) => implementadas.has(n)).length + abstractas;
    tot += interfaces.length + abstractas + clases;
  }
  return { abs, tot };
}

// ---- complejidad ciclomatica ----
// Se usa la API de ESLint (no un comando de shell) para que funcione igual en Windows y Linux.
async function medirCC(): Promise<{ archivo: string; funcion: string; cc: number }[]> {
  const eslint = new ESLint({ overrideConfig: { rules: { complexity: ['warn', 1] } } });
  const cc: { archivo: string; funcion: string; cc: number }[] = [];
  for (const r of await eslint.lintFiles(['src/**/*.ts'])) {
    for (const m of r.messages) {
      const x = /(.+) has a complexity of (\d+)/.exec(m.message);
      if (m.ruleId === 'complexity' && x) cc.push({ archivo: normal(r.filePath).split('/src/')[1], funcion: x[1], cc: Number(x[2]) });
    }
  }
  return cc;
}

void (async () => {
const cc = await medirCC();
cc.sort((a, b) => b.cc - a.cc);

const filas = mods.map((m) => {
  const Ce = new Set(aristas.filter((x) => modulo(x.de) === m).map((x) => x.a)).size;
  const Ca = new Set(aristas.filter((x) => modulo(x.a) === m).map((x) => x.de)).size;
  const I = Ca + Ce === 0 ? 0 : Ce / (Ca + Ce);
  const { abs, tot } = abstraccion(m);
  const A = tot === 0 ? 0 : abs / tot;
  const D = Math.abs(A + I - 1);
  const zona = D > 0.7 && A < 0.3 && I < 0.3 ? 'dolor' : D > 0.7 && A > 0.7 && I > 0.7 ? 'inutilidad' : 'ok';
  return { modulo: m, Ca, Ce, I: +I.toFixed(2), A: +A.toFixed(2), D: +D.toFixed(2), zona };
});

const resumenCC = {
  funciones: cc.length,
  max: cc[0]?.cc ?? 0,
  promedio: +(cc.reduce((s, x) => s + x.cc, 0) / Math.max(cc.length, 1)).toFixed(2),
  menorA5: cc.filter((x) => x.cc < 5).length,
  entre5y10: cc.filter((x) => x.cc >= 5 && x.cc <= 10).length,
  mayorA10: cc.filter((x) => x.cc > 10).length,
  top10: cc.slice(0, 10),
};
console.table(filas);
console.log('CC:', JSON.stringify(resumenCC, null, 1));
writeFileSync('../docs/metricas.json', JSON.stringify({ modulos: filas, cc: resumenCC }, null, 2));
if (resumenCC.mayorA10 > 0) { console.error('FALLA: hay funciones con CC > 10'); process.exit(1); }
})();
