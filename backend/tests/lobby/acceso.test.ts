import { LobbyService } from '../../src/lobby/servicio/LobbyService';
import { UsuarioRepositoryEnMemoria } from '../../src/lobby/repositorio/UsuarioRepository';
import { PartidaService } from '../../src/partidas/servicio/PartidaService';
import { PartidaRepositoryEnMemoria } from '../../src/partidas/repositorio/PartidaRepositoryEnMemoria';
import { MotorLogicaJuego } from '../../src/motor-reglas/MotorLogicaJuego';
import { crearRegistroPorDefecto } from '../../src/motor-reglas/registroPorDefecto';
import { BusEventos } from '../../src/compartido/BusEventos';

const montar = () => new LobbyService(new UsuarioRepositoryEnMemoria(),
  new PartidaService(new PartidaRepositoryEnMemoria(), new MotorLogicaJuego(crearRegistroPorDefecto()), new BusEventos()));

describe('Acceso con nombre y PIN', () => {
  it('volver a entrar con el mismo nombre y PIN devuelve la misma identidad con otra ficha', async () => {
    const l = montar();
    const a = await l.entrar('Ana', '1234');
    const b = await l.entrar('ana', '1234');   // sin distinguir mayusculas
    expect(b.id).not.toBe(a.id);                // la ficha de sesion es nueva
    expect(l.identidadDeSesion(a.id)!.id).toBe(l.identidadDeSesion(b.id)!.id);
    expect(l.identidadDeSesion(a.id)!.id).not.toBe(a.id);   // la identidad real no es la ficha
  });

  it('un nombre ocupado con otro PIN no entra', async () => {
    const l = montar();
    await l.entrar('Ana', '1234');
    await expect(l.entrar('Ana', '9999')).rejects.toMatchObject({ codigo: 'PIN_INCORRECTO' });
  });

  it('tras varios PIN incorrectos el nombre se bloquea, incluso para el PIN correcto', async () => {
    const l = montar();
    await l.entrar('Ana', '1234');
    for (let i = 0; i < 5; i++) await expect(l.entrar('Ana', '0000')).rejects.toMatchObject({ codigo: 'PIN_INCORRECTO' });
    await expect(l.entrar('Ana', '1234')).rejects.toMatchObject({ codigo: 'DEMASIADOS_INTENTOS' });
  });

  it('rechaza PIN ausente o con formato invalido, y una ficha desconocida no autentica', async () => {
    const l = montar();
    for (const pin of [undefined, 1234, '12', '123456789', 'abcd', '12 4']) {
      await expect(l.entrar('Ana', pin)).rejects.toMatchObject({ codigo: 'PIN_INVALIDO' });
    }
    expect(l.identidadDeSesion('inventada')).toBeUndefined();
  });
});
