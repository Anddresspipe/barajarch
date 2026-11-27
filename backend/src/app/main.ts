import { createServer } from 'http';
import { readdir, readFile } from 'fs/promises';
import { join, extname, resolve, sep } from 'path';
import { Pool } from 'pg';
import { crearRegistroPorDefecto } from '../motor-reglas/registroPorDefecto';
import { MotorLogicaJuego } from '../motor-reglas/MotorLogicaJuego';
import { BusEventos } from '../compartido/BusEventos';
import { PartidaService } from '../partidas/servicio/PartidaService';
import { PartidaController } from '../partidas/controlador/PartidaController';
import { PartidaGateway } from '../partidas/controlador/PartidaGateway';
import { PartidaRepositoryEnMemoria } from '../partidas/repositorio/PartidaRepositoryEnMemoria';
import { PartidaRepositoryPostgres } from '../partidas/repositorio/PartidaRepositoryPostgres';
import { IPartidaRepository } from '../partidas/repositorio/IPartidaRepository';
import { IUsuarioRepository, UsuarioRepositoryEnMemoria } from '../lobby/repositorio/UsuarioRepository';
import { UsuarioRepositoryPostgres } from '../lobby/repositorio/UsuarioRepositoryPostgres';
import { Presencia } from '../compartido/Presencia';
import { LobbyService } from '../lobby/servicio/LobbyService';
import { LobbyController } from '../lobby/controlador/LobbyController';
import { CABECERAS_SEGURIDAD } from '../compartido/seguridad';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const RAIZ_ESTATICA = resolve(process.env.FRONTEND_DIR ?? join(__dirname, '..', '..', '..', 'frontend'));

function crearRepositorio(): IPartidaRepository {
  if (process.env.DATABASE_URL) return new PartidaRepositoryPostgres(new Pool({ connectionString: process.env.DATABASE_URL }));
  console.log('DATABASE_URL no definida: usando repositorio en memoria');
  return new PartidaRepositoryEnMemoria();
}

/** Aplica las migraciones (todas idempotentes): una base creada antes de una version nueva no tiene sus tablas. */
async function migrar(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const dir = join(__dirname, '..', '..', 'db', 'migrations');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) await pool.query(await readFile(join(dir, f), 'utf8'));
  } finally {
    await pool.end();
  }
}

function crearUsuarios(): IUsuarioRepository {
  return process.env.DATABASE_URL
    ? new UsuarioRepositoryPostgres(new Pool({ connectionString: process.env.DATABASE_URL }))
    : new UsuarioRepositoryEnMemoria();
}

async function servirEstatico(url: string): Promise<{ tipo: string; cuerpo: Buffer } | null> {
  try {
    const pedido = decodeURIComponent(url.split('?')[0]);
    const ruta = resolve(RAIZ_ESTATICA, '.' + (pedido === '/' ? '/index.html' : pedido));
    if (!ruta.startsWith(RAIZ_ESTATICA + sep)) return null;   // fuera de la carpeta publica
    return { tipo: MIME[extname(ruta)] ?? 'application/octet-stream', cuerpo: await readFile(ruta) };
  } catch {
    return null;   // no existe o URL mal codificada: 404
  }
}

export function arrancar(puerto: number, repo: IPartidaRepository = crearRepositorio(), usuarios: IUsuarioRepository = crearUsuarios()): ReturnType<typeof createServer> {
  const bus = new BusEventos();
  const presencia = new Presencia();
  const motor = new MotorLogicaJuego(crearRegistroPorDefecto());
  const partidas = new PartidaService(repo, motor, bus, Math.random, Number(process.env.TURNO_SEGUNDOS ?? 60) * 1000, presencia,
    Number(process.env.ABANDONO_TOTAL_SEGUNDOS ?? 300) * 1000);
  const lobbyService = new LobbyService(usuarios, partidas);
  const lobby = new LobbyController(lobbyService);
  const server = createServer(async (req, res) => {
    if (await lobby.manejar(req, res)) return;
    const f = await servirEstatico(req.url ?? '/');
    if (!f) { res.writeHead(404, CABECERAS_SEGURIDAD); res.end('No encontrado'); return; }
    res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': f.tipo });
    res.end(f.cuerpo);
  });
  new PartidaGateway(server, new PartidaController(partidas), bus, (ficha) => lobbyService.identidadDeSesion(ficha), presencia, undefined, Number(process.env.PING_MS ?? 15000));
  // Despues del gateway: asi la presencia ya se rastrea y, sin nadie conectado, solo corre la cuenta del abandono total
  partidas.reanudarTemporizadores().catch((e) => console.error('no se pudieron reanudar los temporizadores', e));
  const escuchar = (): void => { server.listen(puerto, () => console.log(`BarajaArch escuchando en :${puerto}`)); };
  if (!process.env.DATABASE_URL) escuchar();   // sin base de datos no hay nada que preparar: escucha ya
  else migrar().then(escuchar).catch((e) => { console.error('no se pudo preparar la base de datos', e); process.exit(1); });
  return server;
}

if (require.main === module) arrancar(Number(process.env.PORT ?? 3000));
