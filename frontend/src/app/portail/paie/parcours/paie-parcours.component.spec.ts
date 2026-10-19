import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { PaieParcours } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieParcoursComponent } from './paie-parcours.component';

registerLocaleData(localeFr);

const PARCOURS: PaieParcours = {
  employeId: 9,
  indicateurs: { moisPayes: 3, totalPercu: 13200, joursTravailles: 78, premierMois: '2026-07', dernierMois: '2026-09' },
  mois: [
    { bulletinId: 33, periode: '2026-09', fonction: 'CHAUFFEUR', chantier: 'C168', equipe: null, nombreJoursTravailles: 26, salaireMensuel: 4500, salaireTotal: 4500, observation: null },
    { bulletinId: 22, periode: '2026-08', fonction: 'OPERATEUR', chantier: 'C168', equipe: 'OP', nombreJoursTravailles: 26, salaireMensuel: 4000, salaireTotal: 4700, observation: null },
    { bulletinId: 11, periode: '2026-07', fonction: 'OPERATEUR', chantier: 'C059', equipe: 'OP', nombreJoursTravailles: 26, salaireMensuel: 4000, salaireTotal: 4000, observation: null }
  ],
  evenements: [
    { periode: '2026-09', type: 'CHANGEMENT_SALAIRE', avant: '4000', apres: '4500', motif: null },
    { periode: '2026-09', type: 'CHANGEMENT_EQUIPE', avant: 'OP', apres: null, motif: null },
    { periode: '2026-09', type: 'CHANGEMENT_FONCTION', avant: 'OPERATEUR', apres: 'CHAUFFEUR', motif: null },
    { periode: '2026-08', type: 'CHANGEMENT_CHANTIER', avant: 'C059', apres: 'C168', motif: null },
    { periode: '2026-07', type: 'DEPART', avant: null, apres: null, motif: 'STC' },
    { periode: '2026-07', type: 'ENTREE', avant: null, apres: 'C059 · OPERATEUR', motif: null }
  ]
};

describe('PaieParcoursComponent', () => {
  let fixture: ComponentFixture<PaieParcoursComponent>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const texte = (selecteur: string) => Array.from(racine().querySelectorAll(selecteur)).map((e) => e.textContent?.replace(/\s+/g, ' ').trim());

  function afficher(parcours: PaieParcours): ReturnType<typeof vi.fn> {
    const service = { parcours: vi.fn().mockReturnValue(of(parcours)) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LOCALE_ID, useValue: 'fr-FR' }, { provide: PaieService, useValue: service }]
    });
    fixture = TestBed.createComponent(PaieParcoursComponent);
    fixture.componentRef.setInput('employeId', 9);
    fixture.detectChanges();
    return service.parcours;
  }

  it('charge le parcours de l’employé et en donne les chiffres', () => {
    const appel = afficher(PARCOURS);

    expect(appel).toHaveBeenCalledWith(9);
    expect(texte('.parcours__tuile strong')).toEqual(['3', '13 200,00', '78', 'septembre 2026']);
    expect(texte('.parcours__tuile small')[0]).toBe('juillet 2026 → septembre 2026');
  });

  it('raconte les changements mois par mois, du plus récent au plus ancien', () => {
    afficher(PARCOURS);

    expect(texte('.parcours__date')).toEqual(['septembre 2026', 'août 2026', 'juillet 2026']);
    expect(texte('.parcours__evenement')).toEqual([
      'Salaire : 4 000,00 → 4 500,00',
      'Équipe : OP → sans équipe',
      'Fonction : OPERATEUR → CHAUFFEUR',
      'Chantier : C059 → C168',
      'Départ de Staport — STC',
      'Première paie — C059 · OPERATEUR'
    ]);
  });

  it('liste les bulletins, chacun ouvrant sa fiche', () => {
    afficher(PARCOURS);

    const liens = Array.from(racine().querySelectorAll('tbody a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(liens).toEqual([
      ['septembre 2026', '/paie/33'],
      ['août 2026', '/paie/22'],
      ['juillet 2026', '/paie/11']
    ]);
  });

  it('annonce un employé sans paie, sans chiffres ni graphique', () => {
    afficher({ employeId: 9, indicateurs: { moisPayes: 0, totalPercu: 0, joursTravailles: 0, premierMois: null, dernierMois: null }, mois: [], evenements: [] });

    expect(racine().textContent).toContain('Aucune paie pour cet employé');
    expect(racine().querySelector('stp-chart')).toBeNull();
  });
});
