import { TestBed } from '@angular/core/testing';

import { lireQuestion } from './accord-ecriture';
import { QuestionUtilisateurComponent } from './question-utilisateur.component';

const QUESTION = {
  question: 'Quel mois voulez-vous ?',
  options: [{ label: '2026-09', description: 'Dernier mois importé' }, { label: '2026-08' }],
  multiple: false
};

describe('QuestionUtilisateurComponent', () => {
  function monter() {
    const fixture = TestBed.createComponent(QuestionUtilisateurComponent);
    fixture.componentRef.setInput('question', QUESTION);
    const repondre = vi.fn();
    fixture.componentInstance.repondre.subscribe(repondre);
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement, repondre };
  }

  it('affiche la question et ses options, valider reste inactif tant que rien n’est choisi', () => {
    const { page } = monter();

    expect(page.querySelector('.app-ask__title')?.textContent).toContain('Quel mois voulez-vous ?');
    expect(page.querySelectorAll('.option')).toHaveLength(2);
    expect((page.querySelector('.valider') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renvoie l’option choisie à l’agent une seule fois', () => {
    const { fixture, page, repondre } = monter();

    (page.querySelectorAll('.option')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    (page.querySelector('.valider') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(repondre).toHaveBeenCalledExactlyOnceWith('2026-08');
    expect(page.querySelector('.reponse')?.textContent).toContain('2026-08');
    expect(page.querySelector('.options')).toBeNull();
  });

  it('une seule option à la fois quand le choix n’est pas multiple, et une réponse libre est acceptée', () => {
    const { fixture, page, repondre } = monter();

    (page.querySelectorAll('.option')[0] as HTMLButtonElement).click();
    (page.querySelectorAll('.option')[1] as HTMLButtonElement).click();
    const champ = page.querySelector('input') as HTMLInputElement;
    champ.value = 'toute l’année';
    champ.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (page.querySelector('.valider') as HTMLButtonElement).click();

    expect(repondre).toHaveBeenCalledWith('2026-08 ; toute l’année');
  });
});

describe('lireQuestion', () => {
  it('lit la question dans la valeur JSON de l’interruption', () => {
    expect(lireQuestion(JSON.stringify({ type: 'question', ...QUESTION }))).toEqual(QUESTION);
  });

  it('ignore l’accord d’écriture, une valeur illisible ou sans option', () => {
    expect(lireQuestion(JSON.stringify({ action_requests: [] }))).toBeNull();
    expect(lireQuestion('pas du json')).toBeNull();
    expect(lireQuestion(undefined)).toBeNull();
    expect(lireQuestion({ type: 'question', question: 'Q ?', options: [] })).toBeNull();
  });
});
