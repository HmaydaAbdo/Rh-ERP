import { convertToParamMap } from '@angular/router';

import { lireMouvementFiltres, versParametresMouvement, versRequete } from './mouvement-filtres';

describe('filtres de mouvements', () => {
  it('lit le mois, les filtres des employés et les valeurs de l’URL, sans jamais de statut', () => {
    const filtres = lireMouvementFiltres(
      convertToParamMap({ periode: '2026-03', nom: 'ali', chantierIds: '3,4', equipeIds: '0', statut: 'ACTIF', valeurs: 'STC, ABANDON' }),
      '2026-11'
    );

    expect(filtres).toEqual({
      periode: '2026-03',
      employes: { nomPrenom: 'ali', cin: '', fonctionIds: [], chantierIds: [3, 4], equipeIds: [0], statut: null },
      valeurs: ['STC', 'ABANDON']
    });
  });

  it('retombe sur le mois par défaut quand la période est absente ou invalide', () => {
    expect(lireMouvementFiltres(convertToParamMap({}), '2026-11').periode).toBe('2026-11');
    expect(lireMouvementFiltres(convertToParamMap({ periode: '2026-13' }), '2026-11').periode).toBe('2026-11');
    expect(lireMouvementFiltres(convertToParamMap({ periode: 'mars' }), '2026-11').periode).toBe('2026-11');
  });

  it('écrit des paramètres d’URL sans valeur vide', () => {
    const parametres = versParametresMouvement({
      periode: '2026-03',
      employes: { nomPrenom: ' ali ', cin: '', fonctionIds: [], chantierIds: [3], equipeIds: [], statut: null },
      valeurs: []
    });

    expect(parametres).toEqual({ nom: 'ali', cin: null, fonctionIds: null, chantierIds: '3', equipeIds: null, statut: null, periode: '2026-03', valeurs: null });
  });

  it('envoie à l’API le même corps pour la liste et le PDF, avec le filtre propre à l’écran sous sa clé', () => {
    const filtres = {
      periode: '2026-03',
      employes: { nomPrenom: 'ali', cin: '', fonctionIds: [], chantierIds: [3], equipeIds: [0], statut: null },
      valeurs: ['STC']
    };

    expect(versRequete(filtres, 'motifs')).toEqual({ periode: '2026-03', nomPrenom: 'ali', chantierIds: [3], equipeIds: [0], motifs: ['STC'] });
    expect(versRequete({ ...filtres, valeurs: ['RETOUR'] }, 'types')).toEqual({ periode: '2026-03', nomPrenom: 'ali', chantierIds: [3], equipeIds: [0], types: ['RETOUR'] });
    expect(versRequete({ ...filtres, valeurs: [] }, 'motifs')).not.toHaveProperty('motifs');
  });
});
