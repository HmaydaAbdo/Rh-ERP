import { PaieImportEcart, PaieImportErreur } from '../models/paie.model';
import { sousCategoriesAvertissements, sousCategoriesEcarts } from './paie-import-categories';

function ecart(employeId: number, ...champs: PaieImportEcart['champs'][number]['champ'][]): PaieImportEcart {
  return {
    employeId,
    numeroLigne: employeId,
    cin: `C${employeId}`,
    nomPrenom: `N${employeId}`,
    champs: champs.map((champ) => ({ champ, base: 'a', fichier: 'b' })),
    typeSalaire: null
  };
}

describe('catégories sémantiques du contrôle', () => {
  it('range chaque écart selon sa nature, par priorité chantier, équipe, fonction, salaire, nom', () => {
    const sous = sousCategoriesEcarts([
      ecart(1, 'nomPrenom'),
      ecart(2, 'chantier', 'equipe'),
      ecart(3, 'equipe'),
      ecart(4, 'nomPrenom', 'salaire'),
      ecart(5, 'fonction', 'salaire'),
      ecart(6, 'chantier')
    ]);

    expect(sous.map((s) => [s.libelle, s.elements.map((e) => e.employeId)])).toEqual([
      ['Mutations de chantier', [2, 6]],
      ['Changements d’équipe', [3]],
      ['Changements de fonction', [5]],
      ['Révisions de salaire', [4]],
      ['Noms écrits autrement', [1]]
    ]);
  });

  it('n’affiche pas une nature sans cas', () => {
    expect(sousCategoriesEcarts([ecart(1, 'equipe')]).map((s) => s.cle)).toEqual(['equipe']);
    expect(sousCategoriesEcarts([])).toEqual([]);
  });

  it('range les avertissements par motif', () => {
    const avertissement = (codeAvertissement: string): PaieImportErreur =>
      ({ numeroLigne: 1, cin: 'C1', nomPrenom: 'N', champ: 'x', valeur: null, raison: '', avertissement: true, codeAvertissement }) as PaieImportErreur;

    const sous = sousCategoriesAvertissements([avertissement('SALAIRE_DIFFERENT'), avertissement('EQUIPE_VIDE'), avertissement('SALAIRE_DIFFERENT')]);

    expect(sous.map((s) => [s.libelle, s.elements.length])).toEqual([
      ['Équipe laissée vide dans le fichier', 1],
      ['Salaire différent de la dernière paie', 2]
    ]);
  });
});
