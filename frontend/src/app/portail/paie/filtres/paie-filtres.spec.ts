import { convertToParamMap } from '@angular/router';

import { AUCUN_FILTRE, PaieFiltres, lireFiltres, versCriteres, versParametres } from './paie-filtres';

describe('filtres de la paie (URL)', () => {
    it('lit tous les filtres d\'une URL', () => {
        const filtres = lireFiltres(convertToParamMap({ periode: '2026-08', nom: 'ali', cin: 'AB1', chantierIds: '3,4', fonctionIds: '7', equipeIds: '2' }));

        expect(filtres).toEqual({ periode: '2026-08', nomPrenom: 'ali', cin: 'AB1', chantierIds: [3, 4], fonctionIds: [7], equipeIds: [2] });
    });

    it('ignore les valeurs invalides', () => {
        const filtres = lireFiltres(convertToParamMap({ periode: '2026-13', chantierIds: 'x,-2,1.5,0', equipeIds: '' }));

        expect(filtres).toEqual(AUCUN_FILTRE);
    });

    it('écrit des paramètres vides à null pour les retirer de l\'URL', () => {
        expect(versParametres(AUCUN_FILTRE)).toEqual({
            periode: null,
            nom: null,
            cin: null,
            chantierIds: null,
            fonctionIds: null,
            equipeIds: null
        });
    });

    it('écrit les identifiants séparés par des virgules et retire les espaces autour du texte', () => {
        const filtres: PaieFiltres = { ...AUCUN_FILTRE, nomPrenom: ' ali ', chantierIds: [3, 4] };

        expect(versParametres(filtres)).toEqual(expect.objectContaining({ nom: 'ali', chantierIds: '3,4' }));
    });

    it('relit ce qu\'il a écrit', () => {
        const filtres: PaieFiltres = { periode: '2026-07', nomPrenom: 'ali', cin: 'AB1', chantierIds: [3, 4], fonctionIds: [7], equipeIds: [2, 5] };

        const params = Object.fromEntries(Object.entries(versParametres(filtres)).filter(([, valeur]) => valeur !== null));

        expect(lireFiltres(convertToParamMap(params))).toEqual(filtres);
    });

    it('transmet à l\'API undefined pour un filtre absent, et peut laisser le mois de côté', () => {
        const filtres: PaieFiltres = { ...AUCUN_FILTRE, periode: '2026-08', cin: 'AB1', equipeIds: [2] };

        const criteres = versCriteres(filtres);
        expect(criteres.periode).toBe('2026-08');
        expect(criteres.cin).toBe('AB1');
        expect(criteres.equipeIds).toEqual([2]);
        expect(criteres.nomPrenom).toBeUndefined();
        expect(criteres.chantierIds).toBeUndefined();
        expect(versCriteres(filtres, false).periode).toBeUndefined();
    });
});
