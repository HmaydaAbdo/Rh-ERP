import { AUCUN_FILTRE, PaieFiltres } from '../filtres/paie-filtres';
import { annonceChangementDeVue } from './paie-vues-annonce';

describe('annonceChangementDeVue', () => {
  const filtres = (surcharge: Partial<PaieFiltres>): PaieFiltres => ({ ...AUCUN_FILTRE, ...surcharge });

  it('ne dit rien quand la vue ne change pas', () => {
    expect(annonceChangementDeVue('cartes', 'cartes', filtres({ periode: '2026-08' }))).toBeNull();
  });

  it('annonce le niveau d\'arrivée dans les cartes selon le contexte', () => {
    expect(annonceChangementDeVue('tabulaire', 'cartes', filtres({}))).toBe('Cartes : niveau mois.');
    expect(annonceChangementDeVue('tabulaire', 'cartes', filtres({ periode: '2026-08' }))).toBe('Cartes : niveau chantiers de août 2026.');
    expect(annonceChangementDeVue('analytique', 'cartes', filtres({ periode: '2026-08', chantierIds: [3] }))).toBe(
      'Cartes : ouvertes directement sur le chantier choisi.'
    );
    expect(annonceChangementDeVue('tabulaire', 'cartes', filtres({ periode: '2026-08', chantierIds: [3, 4, 5] }))).toBe(
      'Cartes : niveau chantiers, limité à vos 3 chantiers.'
    );
  });

  it('rappelle les filtres que les cartes ne posent pas mais gardent', () => {
    const annonce = annonceChangementDeVue('tabulaire', 'cartes', filtres({ nomPrenom: 'ali', fonctionIds: [1], equipeIds: [2] }));

    expect(annonce).toContain('Les filtres nom, fonctions, équipes restent actifs');
  });

  it('dit que la position des cartes devient des filtres, et se tait sans position', () => {
    expect(annonceChangementDeVue('cartes', 'tabulaire', filtres({ periode: '2026-08', chantierIds: [3] }))).toBe(
      'Votre position dans les cartes devient des filtres : août 2026, 1 chantier.'
    );
    expect(annonceChangementDeVue('cartes', 'analytique', filtres({}))).toBeNull();
  });

  it('ne dit rien entre le tableau et l\'analytique : le contexte est identique', () => {
    expect(annonceChangementDeVue('tabulaire', 'analytique', filtres({ periode: '2026-08' }))).toBeNull();
  });
});
