import { ColumnState, TableColumn } from './table-columns';

const COLONNES: TableColumn[] = [
  { field: 'nom', header: 'Nom' },
  { field: 'cin', header: 'CIN' },
  { field: 'fonction', header: 'Fonction' },
  { field: 'statut', header: 'Statut' }
];

const champs = (colonnes: TableColumn[]) => colonnes.map((c) => c.field);

describe('ColumnState', () => {
  let etat: ColumnState;

  beforeEach(() => (etat = new ColumnState(COLONNES)));

  it('montre toutes les colonnes, dans l’ordre donné, au départ', () => {
    expect(champs(etat.visible)).toEqual(['nom', 'cin', 'fonction', 'statut']);
    expect(etat.selectedFields).toEqual(['nom', 'cin', 'fonction', 'statut']);
    expect(champs(etat.all)).toEqual(['nom', 'cin', 'fonction', 'statut']);
  });

  describe('visibilité', () => {
    it('masque les colonnes décochées en gardant l’ordre', () => {
      etat.setSelected(['statut', 'nom']);

      expect(etat.selectedFields).toEqual(['nom', 'statut']);
      expect(champs(etat.visible)).toEqual(['nom', 'statut']);
    });

    it('ignore une sélection vide : au moins une colonne reste visible', () => {
      etat.setSelected(['cin']);

      etat.setSelected([]);

      expect(champs(etat.visible)).toEqual(['cin']);
      expect(etat.selectedFields).toEqual(['cin']);
    });

    it('renvoie une nouvelle liste de champs quand une sélection vide est ignorée (le sélecteur se resynchronise)', () => {
      const avant = etat.selectedFields;

      etat.setSelected([]);

      expect(etat.selectedFields).toEqual(avant);
      expect(etat.selectedFields).not.toBe(avant);
    });

    it('réaffiche une colonne masquée à sa place d’origine', () => {
      etat.setSelected(['nom', 'statut']);

      etat.setSelected(['nom', 'cin', 'statut']);

      expect(champs(etat.visible)).toEqual(['nom', 'cin', 'statut']);
    });
  });

  describe('réordonnancement', () => {
    it('applique le nouvel ordre des colonnes visibles', () => {
      etat.onReorder([COLONNES[1], COLONNES[0], COLONNES[2], COLONNES[3]]);

      expect(champs(etat.visible)).toEqual(['cin', 'nom', 'fonction', 'statut']);
    });

    it('conserve l’ordre choisi quand une colonne est masquée puis réaffichée', () => {
      etat.onReorder([COLONNES[3], COLONNES[1], COLONNES[2], COLONNES[0]]);

      etat.setSelected(['statut', 'nom']);
      expect(champs(etat.visible)).toEqual(['statut', 'nom']);

      etat.setSelected(['statut', 'cin', 'fonction', 'nom']);
      expect(champs(etat.visible)).toEqual(['statut', 'cin', 'fonction', 'nom']);
    });

    it('ne déplace pas les colonnes masquées : seules les places des colonnes visibles sont réattribuées', () => {
      etat.setSelected(['nom', 'fonction', 'statut']);

      etat.onReorder([COLONNES[3], COLONNES[0], COLONNES[2]]);
      etat.setSelected(['nom', 'cin', 'fonction', 'statut']);

      expect(champs(etat.visible)).toEqual(['statut', 'cin', 'nom', 'fonction']);
    });

    it('ignore un ordre absent', () => {
      etat.onReorder(undefined);

      expect(champs(etat.visible)).toEqual(['nom', 'cin', 'fonction', 'statut']);
    });
  });
});
