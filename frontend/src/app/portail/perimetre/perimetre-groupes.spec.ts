import { PaieAnalytique } from '../paie/models/paie.model';
import { fusionnerGroupes, GroupeCarte, lignesPaie, nomGroupe, variations } from './perimetre-groupes';

const ANALYSE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 0, effectif: 0, coutMoyen: null, nombreChantiers: 0, stc: 0, stcMontant: 0 },
  moisPrecedent: null, tranches: [], evolution: [], qualite: { sansEquipe: 0, sansObservation: 0 },
  parChantier: [{ id: 1, code: 'C168', libelle: null, masse: 100, effectif: 2, stc: 1, stcMontant: 10 }],
  parEquipe: [{ id: null, code: null, libelle: null, masse: 50, effectif: 1, stc: 0, stcMontant: 0 }, { id: 5, code: 'CH', libelle: 'Chauffeurs', masse: 70, effectif: 1, stc: 0, stcMontant: 0 }],
  parFonction: [{ id: 7, libelle: 'MACON', masse: 30, effectif: 1, stc: 0, stcMontant: 0 }]
};

describe('lignesPaie', () => {
  it('normalise les trois répartitions : « Orphelins » conserve l’identifiant 0, le libellé retombe sur le code', () => {
    expect(lignesPaie('CHANTIER', ANALYSE)[0]).toMatchObject({ id: 1, code: 'C168', libelle: 'C168', stc: 1 });
    expect(lignesPaie('EQUIPE', ANALYSE).map((l) => [l.id, l.libelle])).toEqual([[0, 'Orphelins'], [5, 'Chauffeurs']]);
    expect(lignesPaie('FONCTION', ANALYSE)[0]).toMatchObject({ id: 7, code: null, libelle: 'MACON' });
    expect(lignesPaie('CHANTIER', null)).toEqual([]);
  });
});

describe('nomGroupe', () => {
  it('préfère le libellé pour les équipes et garde le code des autres référentiels', () => {
    expect(nomGroupe('CHANTIER', { id: 1, code: 'C168', libelle: 'Nador' })).toBe('C168');
    expect(nomGroupe('EQUIPE', { id: 5, code: 'CH', libelle: 'Chauffeurs' })).toBe('Chauffeurs');
    expect(nomGroupe('FONCTION', { id: 7, code: null, libelle: 'MACON' })).toBe('MACON');
    expect(nomGroupe('EQUIPE', { id: 0, code: null, libelle: '' })).toBe('Orphelins');
  });
});

describe('fusionnerGroupes', () => {
  const catalogue = [
    { id: 1, code: 'C168', libelle: 'Nador', detail: null, statut: { libelle: 'En cours', severite: 'success' as const } },
    { id: 2, code: 'C196', libelle: 'Marrakech', detail: null, statut: null }
  ];
  const fiches = [{ id: 1, code: 'C168', libelle: 'Nador', effectif: 3, actifs: 2 }, { id: 9, code: 'C999', libelle: 'Autre', effectif: 1, actifs: 1 }];
  const paie = [{ id: 1, code: 'C168', libelle: 'Nador', effectif: 2, masse: 100, stc: 1, stcMontant: 10 }];
  const precedente = [{ id: 1, code: 'C168', libelle: 'Nador', effectif: 1, masse: 80, stc: 0, stcMontant: 0 }];

  it('avec un référentiel exhaustif, fait de chaque entrée une carte, à zéro sans fiche ni bulletin', () => {
    const groupes = fusionnerGroupes('CHANTIER', { catalogue, exhaustif: true, fiches, paie, paiePrecedente: precedente, lien: (id) => ['/chantiers', id] });

    expect(groupes.map((g) => g.id)).toEqual([1, 2]);
    expect(groupes[0]).toMatchObject({ statut: { libelle: 'En cours' }, lien: ['/chantiers', 1], fiches: { effectif: 3, actifs: 2 }, paie: { masse: 100 }, precedent: { masse: 80 } });
    expect(groupes[1]).toMatchObject({ fiches: { effectif: 0, actifs: 0 }, paie: { effectif: 0, masse: 0 }, precedent: { effectif: 0, masse: 0, stc: 0, stcMontant: 0 } });
  });

  it('conserve « Orphelins » depuis la Paie même si le catalogue Équipe est exhaustif', () => {
    const equipes = [{ id: 5, code: 'CH', libelle: 'Chauffeurs', detail: null, statut: null }];
    const groupes = fusionnerGroupes('EQUIPE', {
      catalogue: equipes,
      exhaustif: true,
      fiches: null,
      paie: lignesPaie('EQUIPE', ANALYSE),
      paiePrecedente: null,
      lien: null
    });

    expect(groupes.map((groupe) => [groupe.id, groupe.libelle])).toEqual([[5, 'Chauffeurs'], [0, 'Orphelins']]);
    expect(groupes.find((groupe) => groupe.id === 0)?.paie).toMatchObject({ effectif: 1, masse: 50 });
  });

  it('sans référentiel exhaustif, ne crée une carte que pour les groupes qui ont une fiche ou un bulletin, et décore ceux du référentiel', () => {
    const groupes = fusionnerGroupes('CHANTIER', { catalogue, exhaustif: false, fiches, paie, paiePrecedente: null, lien: null });

    expect(groupes.map((g) => g.id)).toEqual([1, 9]);
    expect(groupes[0].statut?.libelle).toBe('En cours');
    expect(groupes[1].statut).toBeNull();
    expect(groupes[0].precedent).toBeNull();
  });

  it('laisse à null une source indisponible au lieu d’inventer des chiffres', () => {
    const groupes = fusionnerGroupes('CHANTIER', { catalogue: null, exhaustif: false, fiches: null, paie, paiePrecedente: null, lien: null });

    expect(groupes[0].fiches).toBeNull();
    expect(groupes[0].paie).not.toBeNull();
  });

  it('trie les codes des autres dimensions en ordre naturel', () => {
    const lignes = [{ id: 1, code: 'C10', libelle: '', effectif: 0, actifs: 0 }, { id: 2, code: 'C9', libelle: '', effectif: 0, actifs: 0 }];

    expect(fusionnerGroupes('CHANTIER', { catalogue: null, exhaustif: false, fiches: lignes, paie: null, paiePrecedente: null, lien: null }).map((g) => g.code)).toEqual(['C9', 'C10']);
  });
});

describe('variations', () => {
  const groupe = (paie: GroupeCarte['paie'], precedent: GroupeCarte['precedent']): GroupeCarte =>
    ({ id: 1, code: 'C', libelle: 'C', detail: null, statut: null, lien: null, fiches: null, paie, precedent });

  it('compare au mois contigu : pourcentage pour les montants, écart pour les personnes', () => {
    const v = variations(groupe({ effectif: 3, masse: 4500, stc: 1, stcMontant: 1000 }, { effectif: 1, masse: 4000, stc: 0, stcMontant: 800 }));

    expect(v).toEqual({ masse: '+12,5 %', effectif: '+2 personnes', stc: '+1 personne', stcMontant: '+25,0 %' });
  });

  it('signale l’absence de comparaison, la stabilité et une base monétaire nulle', () => {
    expect(variations(groupe({ effectif: 1, masse: 1, stc: 0, stcMontant: 0 }, null))).toBeNull();
    expect(variations(groupe({ effectif: 1, masse: 100, stc: 0, stcMontant: 0 }, { effectif: 1, masse: 100, stc: 0, stcMontant: 0 }))).toEqual({ masse: 'Stable', effectif: 'Stable', stc: 'Stable', stcMontant: 'Stable' });
    expect(variations(groupe({ effectif: 1, masse: 100, stc: 1, stcMontant: 5 }, { effectif: 0, masse: 0, stc: 0, stcMontant: 0 }))?.masse).toBeNull();
  });

  it('écrit une baisse avec le vrai signe moins', () => {
    expect(variations(groupe({ effectif: 1, masse: 90, stc: 0, stcMontant: 0 }, { effectif: 3, masse: 100, stc: 0, stcMontant: 0 }))).toMatchObject({ effectif: '−2 personnes', masse: '-10,0 %' });
  });
});
