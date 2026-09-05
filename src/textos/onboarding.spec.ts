import { textos } from './onboarding';

describe('onboarding.holaDeNuevo', () => {
  it('incluye la lista de equipos y el cierre', () => {
    const texto = textos.holaDeNuevo('- Sub-11', 'Escribe /ayuda.');

    expect(texto).toContain('¡Hola de nuevo!');
    expect(texto).toContain('- Sub-11');
    expect(texto).toContain('Escribe /ayuda.');
  });
});

describe('onboarding.academiaCreada', () => {
  it('incluye el nombre de la academia', () => {
    expect(textos.academiaCreada('Deportivo Sub')).toContain('Academia "Deportivo Sub" creada ✅');
  });
});

describe('onboarding.nombreEquipoRepetido', () => {
  it('incluye el nombre repetido', () => {
    expect(textos.nombreEquipoRepetido('Sub-11')).toContain('Ya tienes un equipo llamado "Sub-11"');
  });
});

describe('onboarding.preguntaFormato', () => {
  it('incluye el nombre del equipo', () => {
    expect(textos.preguntaFormato('Sub-11')).toContain('Sub-11');
  });
});

describe('onboarding.pedirCodigoConError', () => {
  it('antepone el error al pedido del código', () => {
    const texto = textos.pedirCodigoConError('Ese código ya no es válido.');

    expect(texto).toContain('Ese código ya no es válido.');
    expect(texto).toContain('Pega el código aquí:');
  });
});
