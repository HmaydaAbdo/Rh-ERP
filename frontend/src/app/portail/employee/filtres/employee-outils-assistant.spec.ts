import { AUCUN_FILTRE, EmployeeFiltres } from './employee-filtres';
import {
  fusionnerFiltres,
  outilFiltresEmployes,
} from './employee-outils-assistant';

const COURANTS: EmployeeFiltres = {
  ...AUCUN_FILTRE,
  nomPrenom: 'ali',
  chantierIds: [3],
  statut: 'ACTIF',
};

describe('outil « régler les filtres » de la page des employés', () => {
  it('ne change que les champs précisés', () => {
    expect(fusionnerFiltres(COURANTS, { cin: 'AB1' })).toEqual({
      ...COURANTS,
      cin: 'AB1',
    });
  });

  it('retire le statut quand l’agent envoie null, et le garde quand il ne dit rien', () => {
    expect(fusionnerFiltres(COURANTS, { statut: null }).statut).toBeNull();
    expect(fusionnerFiltres(COURANTS, {}).statut).toBe('ACTIF');
  });

  it('efface tout avant d’appliquer quand on demande de réinitialiser', () => {
    expect(
      fusionnerFiltres(COURANTS, { reinitialiser: true, equipeIds: [2] }),
    ).toEqual({ ...AUCUN_FILTRE, equipeIds: [2] });
  });

  it('applique le résultat à la page quand l’agent appelle l’outil', async () => {
    const appliquer = vi.fn();
    const outil = outilFiltresEmployes(() => COURANTS, appliquer);

    await outil.handler?.({ nom: 'karim' }, {} as never);

    expect(appliquer).toHaveBeenCalledWith({ ...COURANTS, nomPrenom: 'karim' });
  });

  it('refuse des arguments hors schéma (statut inconnu, trop d’identifiants)', async () => {
    const schema = outilFiltresEmployes(() => COURANTS, vi.fn()).parameters[
      '~standard'
    ];

    expect((await schema.validate({ statut: 'ARCHIVE' })).issues).toBeDefined();
    expect(
      (
        await schema.validate({
          chantierIds: Array.from({ length: 51 }, (_, i) => i),
        })
      ).issues,
    ).toBeDefined();
    expect((await schema.validate({ statut: 'ACTIF' })).issues).toBeUndefined();
  });
});
