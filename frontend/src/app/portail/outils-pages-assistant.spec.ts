import { AUCUN_FILTRE_CHANTIER } from './chantier/filtres/chantier-filtres';
import {
  fusionnerFiltresChantier,
  outilFiltresChantiers,
} from './chantier/filtres/chantier-outils-assistant';
import { AUCUN_FILTRE_EQUIPE } from './equipe/filtres/equipe-filtres';
import { fusionnerFiltresEquipe } from './equipe/filtres/equipe-outils-assistant';
import { outilFiltresFonctions } from './function/filtres/function-outils-assistant';
import { parametresUrlHeuresSupp } from './heures-supp/vues/heures-supp-outils-assistant';
import { AUCUN_FILTRE } from './paie/filtres/paie-filtres';
import {
  fusionnerFiltresPaie,
  outilFiltresPaie,
} from './paie/filtres/paie-outils-assistant';

describe('outils de filtres des pages pour l’agent (KAN-270)', () => {
  it('chantiers : ne change que les champs précisés, null retire « actif », réinitialiser efface', () => {
    const courants = { ...AUCUN_FILTRE_CHANTIER, code: 'C1', actif: true };

    expect(fusionnerFiltresChantier(courants, { designation: 'pont' })).toEqual(
      { ...courants, designation: 'pont' },
    );
    expect(
      fusionnerFiltresChantier(courants, { actif: null }).actif,
    ).toBeNull();
    expect(
      fusionnerFiltresChantier(courants, { reinitialiser: true, code: 'C2' }),
    ).toEqual({ ...AUCUN_FILTRE_CHANTIER, code: 'C2' });
  });

  it('équipes : fusion champ par champ', () => {
    const courants = { code: 'E1', libelle: 'Maçons' };

    expect(fusionnerFiltresEquipe(courants, { libelle: 'Coffreurs' })).toEqual({
      code: 'E1',
      libelle: 'Coffreurs',
    });
    expect(fusionnerFiltresEquipe(courants, { reinitialiser: true })).toEqual(
      AUCUN_FILTRE_EQUIPE,
    );
  });

  it('fonctions : applique le libellé demandé', async () => {
    const appliquer = vi.fn();

    await outilFiltresFonctions(appliquer).handler?.(
      { libelle: 'chef' },
      {} as never,
    );

    expect(appliquer).toHaveBeenCalledWith({ libelle: 'chef' });
  });

  it('paie : la vue analytique garde son mois (on ne peut ni le retirer ni le perdre en réinitialisant)', () => {
    const courants = { ...AUCUN_FILTRE, periode: '2026-10', nomPrenom: 'ali' };

    expect(
      fusionnerFiltresPaie(courants, { periode: null }, true).periode,
    ).toBe('2026-10');
    expect(
      fusionnerFiltresPaie(courants, { periode: null }, false).periode,
    ).toBeNull();
    expect(
      fusionnerFiltresPaie(courants, { reinitialiser: true }, true),
    ).toEqual({ ...AUCUN_FILTRE, periode: '2026-10' });
    expect(
      fusionnerFiltresPaie(courants, { periode: '2026-09' }, true).periode,
    ).toBe('2026-09');
  });

  it('paie : refuse un mois mal formé', async () => {
    const schema = outilFiltresPaie(
      () => AUCUN_FILTRE,
      () => false,
      vi.fn(),
    ).parameters['~standard'];

    expect(
      (await schema.validate({ periode: '2026-13' })).issues,
    ).toBeDefined();
    expect(
      (await schema.validate({ periode: '2026-10' })).issues,
    ).toBeUndefined();
  });

  it('chantiers : les noms d’outils sont uniques et sans espace (le modèle les appelle par nom)', () => {
    const noms = [
      outilFiltresChantiers(() => AUCUN_FILTRE_CHANTIER, vi.fn()).name,
      outilFiltresFonctions(vi.fn()).name,
      outilFiltresPaie(
        () => AUCUN_FILTRE,
        () => false,
        vi.fn(),
      ).name,
    ];

    expect(new Set(noms).size).toBe(noms.length);
    noms.forEach((nom) => expect(nom).toMatch(/^[a-z_]+$/));
  });

  it('heures supplémentaires : seuls les paramètres précisés changent, réinitialiser vide tout d’abord', () => {
    expect(
      parametresUrlHeuresSupp({ nom: ' ali ', chantierIds: [3, 4] }),
    ).toEqual({ nom: 'ali', chantierIds: '3,4', page: null });
    expect(parametresUrlHeuresSupp({ cin: '' })['cin']).toBeNull();
    expect(
      parametresUrlHeuresSupp({ reinitialiser: true, periode: '2026-10' }),
    ).toMatchObject({
      periode: '2026-10',
      nom: null,
      cin: null,
      chantierIds: null,
      equipeIds: null,
      fonctionIds: null,
    });
  });
});
