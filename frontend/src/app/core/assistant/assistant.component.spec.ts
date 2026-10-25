import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AssistantComponent } from './assistant.component';
import { AssistantService, type Echange, type Humeur } from './assistant.service';

function echange(partiel: Partial<Echange> = {}): Echange {
  return {
    id: 'e1',
    question: 'Masse salariale du chantier C-12 en 2026-09 ?',
    etat: 'reponse',
    etapes: [
      { nom: 'preparer', libelle: 'Comprendre la question', terminee: true },
      { nom: 'executer', libelle: 'Lire les données', terminee: true }
    ],
    outils: ['paie_indicateurs'],
    texte: 'En 2026-09 : masse 1 250 000,50 MAD.',
    chiffres: ['1250000.5'],
    motif: null,
    ouverture: {
      cible: { commandes: ['/paie', 'analytique'], queryParams: {}, libelle: 'Paie · Analytique', filtres: ['Période 2026-09'] },
      statut: 'ouverte',
      urlPrecedente: '/employees'
    },
    ...partiel
  };
}

describe('AssistantComponent', () => {
  function afficher(echanges: Echange[] = []) {
    const fil = signal<readonly Echange[]>(echanges);
    const service = {
      echanges: fil,
      humeur: signal<Humeur>('neutral'),
      enCours: computed(() => fil().at(-1)?.etat === 'encours'),
      demander: vi.fn(async () => undefined),
      arreter: vi.fn(),
      revenir: vi.fn(async () => undefined),
      rouvrir: vi.fn(async () => undefined),
      nouvelleDiscussion: vi.fn()
    };
    TestBed.configureTestingModule({ providers: [{ provide: AssistantService, useValue: service }] });
    const fixture = TestBed.createComponent(AssistantComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, service, fil };
  }

  it('propose au repos une barre de commande et des questions d’exemple', () => {
    const { element, service } = afficher();

    expect(element.querySelector('.assistant--barre')).not.toBeNull();
    expect(element.querySelector('kbd')?.textContent).toContain('Ctrl K');
    const suggestion = element.querySelector<HTMLButtonElement>('.assistant-suggestions button');
    suggestion?.click();
    expect(service.demander).toHaveBeenCalledWith(suggestion?.textContent?.trim());
  });

  it('refuse une question vide avec un message lié au champ', () => {
    const { fixture, element, service } = afficher();
    element.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')?.click();
    fixture.detectChanges();

    expect(service.demander).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Saisissez une question');
    expect(element.querySelector('textarea')?.getAttribute('aria-describedby')).toBe('assistant-erreur');
  });

  it('affiche la discussion : question, étapes repliées, réponse vérifiée et vue ouverte', () => {
    const { fixture, element, service } = afficher([echange()]);

    expect(element.querySelector('.assistant--panneau [role="log"]')).not.toBeNull();
    expect(element.querySelector('.assistant-echange__question')?.textContent).toContain('C-12');
    const resume = element.querySelector<HTMLButtonElement>('.assistant-etapes__resume');
    expect(resume?.textContent).toContain('2 étapes · 1 outil');
    expect(resume?.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.assistant-etapes__liste')).toBeNull();

    resume?.click();
    fixture.detectChanges();
    expect(resume?.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelectorAll('.assistant-etapes__etape').length).toBe(2);
    expect(element.querySelector('.assistant-etapes__outils code')?.textContent).toBe('paie_indicateurs');

    expect(element.querySelector('.assistant-badge--ok')?.textContent).toContain('Chiffres vérifiés');
    expect(element.querySelector('.assistant-chiffre')?.textContent?.replace(/\s/g, '')).toBe('1250000,5');
    expect(element.querySelector('.assistant-vue')?.textContent).toContain('Paie · Analytique');
    element.querySelector<HTMLButtonElement>('.assistant-lien')?.click();
    expect(service.revenir).toHaveBeenCalled();
  });

  it('déplie les étapes pendant le travail et transforme l’envoi en arrêt', () => {
    const { element, service } = afficher([
      echange({ etat: 'encours', texte: '', chiffres: [], ouverture: null, etapes: [{ nom: 'cibler', libelle: 'Choisir les domaines', terminee: false }] })
    ]);

    expect(element.querySelector('.assistant-etapes__resume')?.textContent).toContain('Choisir les domaines');
    expect(element.querySelector('.assistant-etapes__liste')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('[aria-label="Arrêter"]')?.click();
    expect(service.arreter).toHaveBeenCalled();
  });

  it('se réduit avec Échap et se rouvre avec Ctrl K', () => {
    const { fixture, element } = afficher([echange()]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('.assistant--panneau')).toBeNull();
    expect(element.querySelector('.assistant-lien--reprendre')?.textContent).toContain('Reprendre la discussion (1)');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    fixture.detectChanges();
    expect(element.querySelector('.assistant--panneau')).not.toBeNull();
  });

  it('signale une vue refusée et propose de réessayer', () => {
    const base = echange();
    const { element, service } = afficher([echange({ ouverture: { ...base.ouverture!, statut: 'refusee' } })]);

    expect(element.querySelector('.assistant-vue--refusee')?.textContent).toContain('Vue non ouverte');
    element.querySelector<HTMLButtonElement>('.assistant-lien')?.click();
    expect(service.rouvrir).toHaveBeenCalled();
  });
});
