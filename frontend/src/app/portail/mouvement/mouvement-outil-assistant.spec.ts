import { fusionnerFiltresEntrants } from '../entrant/filtres/entrant-outils-assistant';
import { fusionnerFiltresSorties } from '../sortie/filtres/sortie-outils-assistant';
import { AUCUN_FILTRE } from '../employee/filtres/employee-filtres';
import { MouvementFiltres } from './mouvement-filtres';

const COURANTS: MouvementFiltres = {
  periode: '2026-10',
  employes: { ...AUCUN_FILTRE, nomPrenom: 'ali', chantierIds: [3], statut: 'ACTIF' },
  valeurs: ['STC']
};

describe('outils de l’agent pour les mouvements', () => {
  it('remplace seulement les champs précisés et garde le mois', () => {
    const filtres = fusionnerFiltresSorties(COURANTS, { cin: 'AB1', motifs: ['ABANDON'] });

    expect(filtres).toEqual({ periode: '2026-10', employes: { ...AUCUN_FILTRE, nomPrenom: 'ali', cin: 'AB1', chantierIds: [3] }, valeurs: ['ABANDON'] });
  });

  it('change de mois et ne touche pas aux autres filtres', () => {
    expect(fusionnerFiltresEntrants(COURANTS, { periode: '2026-09' })).toEqual({ ...COURANTS, periode: '2026-09', employes: { ...COURANTS.employes, statut: null } });
  });

  it('efface les filtres sur demande mais garde le mois', () => {
    expect(fusionnerFiltresEntrants(COURANTS, { reinitialiser: true, types: ['RETOUR'] })).toEqual({ periode: '2026-10', employes: AUCUN_FILTRE, valeurs: ['RETOUR'] });
  });
});
