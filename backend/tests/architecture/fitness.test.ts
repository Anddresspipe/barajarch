import { filesOfProject } from 'tsarch';
import 'tsarch/dist/jest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120000);
const TSCONFIG = 'tsconfig.build.json';

/** Devuelve rutas con '/' en cualquier sistema operativo (en Windows join() usa '\\'). */
function archivos(dir: string, ext: string[]): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n).replace(/\\/g, '/');
    return statSync(r).isDirectory() ? archivos(r, ext) : ext.some((e) => r.endsWith(e)) ? [r] : [];
  });
}

describe('FF-01 Prueba 1: plug-ins de modalidad sin acoplamiento cruzado', () => {
  it('Clasica no depende de Apuntado', async () => {
    const r = filesOfProject(TSCONFIG).matchingPattern('.*ReglaClasicaCuartaTerna.*').shouldNot().dependOnFiles().matchingPattern('.*ReglaApuntado101.*');
    await expect(r).toPassAsync();
  });
  it('Apuntado no depende de Clasica', async () => {
    const r = filesOfProject(TSCONFIG).matchingPattern('.*ReglaApuntado101.*').shouldNot().dependOnFiles().matchingPattern('.*ReglaClasicaCuartaTerna.*');
    await expect(r).toPassAsync();
  });
  it('el motor y los servicios no importan plug-ins concretos', async () => {
    const r = filesOfProject(TSCONFIG).inFolder('partidas/servicio').shouldNot().dependOnFiles().inFolder('motor-reglas/plugins');
    await expect(r).toPassAsync();
  });
  it('CONTROL: la regla detecta una dependencia real (servicio -> motor-reglas)', async () => {
    const r = filesOfProject(TSCONFIG).inFolder('partidas/servicio').shouldNot().dependOnFiles().inFolder('motor-reglas');
    await expect(r).not.toPassAsync();
  });
  it('ningun literal de modalidad fuera de motor-reglas/plugins y app', () => {
    const malos = archivos('src', ['.ts']).filter((f) => !/src\/(motor-reglas|app)\//.test(f))
      .filter((f) => /['"](CLASICA|APUNTADO)['"]/.test(readFileSync(f, 'utf8')));
    expect(malos).toEqual([]);
  });
});

describe('FF-02 Prueba 2: UI/controladores aislados del almacenamiento', () => {
  it('controladores no dependen de repositorios', async () => {
    const r = filesOfProject(TSCONFIG).inFolder('controlador').shouldNot().dependOnFiles().inFolder('repositorio');
    await expect(r).toPassAsync();
  });
  it('servicios no dependen de controladores', async () => {
    const r = filesOfProject(TSCONFIG).inFolder('servicio').shouldNot().dependOnFiles().inFolder('controlador');
    await expect(r).toPassAsync();
  });
  it('el frontend no referencia pg, SQL ni repositorios', () => {
    const prohibido = /(require\(['"]pg['"]\)|from ['"]pg['"]|\bSELECT |\bINSERT |repositorio|DATABASE_URL)/;
    const malos = archivos('../frontend', ['.js', '.html']).filter((f) => prohibido.test(readFileSync(f, 'utf8')));
    expect(malos).toEqual([]);
  });
  it('pg solo se importa en repositorios o app', () => {
    const malos = archivos('src', ['.ts']).filter((f) => !/(repositorio|\/app\/)/.test(f))
      .filter((f) => /from ['"]pg['"]/.test(readFileSync(f, 'utf8')));
    expect(malos).toEqual([]);
  });
});

describe('FF-03 Prueba 3: sin dependencias circulares', () => {
  it('ningun archivo participa en ciclos de dependencia', async () => {
    const r = filesOfProject(TSCONFIG).matchingPattern('^src/.*').should().beFreeOfCycles();
    await expect(r).toPassAsync();
  });
  it('el motor de reglas no depende de partidas ni de lobby', async () => {
    const r = filesOfProject(TSCONFIG).inFolder('motor-reglas').shouldNot().dependOnFiles().inFolder('partidas');
    await expect(r).toPassAsync();
    const r2 = filesOfProject(TSCONFIG).inFolder('motor-reglas').shouldNot().dependOnFiles().inFolder('lobby');
    await expect(r2).toPassAsync();
  });
  it('partidas no depende de lobby', async () => {
    const r = filesOfProject(TSCONFIG).inFolder('partidas').shouldNot().dependOnFiles().inFolder('lobby');
    await expect(r).toPassAsync();
  });
});
