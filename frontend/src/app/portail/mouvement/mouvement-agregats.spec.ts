import { compterParCategorie, grouperMouvements, LigneMouvement, sommeMontants } from './mouvement-agregats';

const LIGNES: LigneMouvement[] = [
  { employeId: 1, nomPrenom: 'A', categorie: 'Retour', categorieCle: 'RETOUR', chantierId: 3, chantier: 'C57', equipeId: 9, equipe: 'E1', fonctionId: 1, fonction: 'Maçon', montant: 1000 },
  { employeId: 2, nomPrenom: 'B', categorie: 'Nouvelle embauche', categorieCle: 'NOUVELLE_EMBAUCHE', chantierId: 3, chantier: 'C57', equipeId: null, equipe: null, fonctionId: 1, fonction: 'Maçon', montant: 2000 },
  { employeId: 3, nomPrenom: 'C', categorie: 'Retour', categorieCle: 'RETOUR', chantierId: 4, chantier: 'C58', fonctionId: 2, fonction: 'Grutier', montant: null }
];

describe('agrégats des mouvements', () => {
  it('compte par catégorie, la plus fréquente d’abord', () => {
    expect(compterParCategorie(LIGNES)).toEqual([
      { categorie: 'Retour', nombre: 2 },
      { categorie: 'Nouvelle embauche', nombre: 1 }
    ]);
  });

  it('additionne les montants connus, ou rien quand la paie n’est pas lisible', () => {
    expect(sommeMontants(LIGNES)).toBe(3000);
    expect(sommeMontants([{ ...LIGNES[0], montant: null }])).toBeNull();
  });

  it('regroupe par chantier avec le filtre qui ramène à la liste', () => {
    const groupes = grouperMouvements(LIGNES, 'chantier');

    expect(groupes.map((g) => [g.libelle, g.nombre, g.montant, g.filtre.valeur])).toEqual([
      ['C57', 2, 3000, 3],
      ['C58', 1, null, 4]
    ]);
    expect(groupes[0].parCategorie).toEqual([
      { categorie: 'Nouvelle embauche', nombre: 1 },
      { categorie: 'Retour', nombre: 1 }
    ]);
  });

  it('range les lignes sans équipe dans un groupe dédié (filtre 0)', () => {
    const groupes = grouperMouvements(LIGNES, 'equipe');

    expect(groupes.find((g) => g.libelle === 'E1')?.nombre).toBe(1);
    expect(groupes.find((g) => g.libelle === 'Sans équipe')).toEqual(expect.objectContaining({ nombre: 2, filtre: { dimension: 'equipe', valeur: 0 } }));
  });

  it('regroupe par catégorie avec la valeur d’API pour filtrer', () => {
    expect(grouperMouvements(LIGNES, 'categorie').map((g) => [g.libelle, g.filtre.valeur])).toEqual([
      ['Retour', 'RETOUR'],
      ['Nouvelle embauche', 'NOUVELLE_EMBAUCHE']
    ]);
  });

  it('ne renvoie aucun groupe pour un mois vide', () => {
    expect(grouperMouvements([], 'fonction')).toEqual([]);
  });
});
