import { TestBed } from '@angular/core/testing';

import { QuestionUtilisateurComponent } from './question-utilisateur.component';

const ARGS = {
  question: 'Quel mois voulez-vous ?',
  options: [{ label: '2026-09', description: 'Dernier mois importé' }, { label: '2026-08' }],
  multiple: false
};

describe('QuestionUtilisateurComponent', () => {
  function monter(respond = vi.fn()) {
    const fixture = TestBed.createComponent(QuestionUtilisateurComponent);
    fixture.componentRef.setInput('toolCall', { name: 'poser_question', args: ARGS, status: 'executing', result: undefined, respond });
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement, respond };
  }

  it('affiche la question et ses options, valider reste inactif tant que rien n’est choisi', () => {
    const { page } = monter();

    expect(page.querySelector('.intitule')?.textContent).toContain('Quel mois voulez-vous ?');
    expect(page.querySelectorAll('.option')).toHaveLength(2);
    expect((page.querySelector('.valider') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renvoie l’option choisie à l’agent', () => {
    const { fixture, page, respond } = monter();

    (page.querySelectorAll('.option')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    (page.querySelector('.valider') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(respond).toHaveBeenCalledWith('2026-08');
    expect(page.querySelector('.reponse')?.textContent).toContain('2026-08');
    expect(page.querySelector('.options')).toBeNull();
  });

  it('une seule option à la fois quand le choix n’est pas multiple, et une réponse libre est acceptée', () => {
    const { fixture, page, respond } = monter();

    (page.querySelectorAll('.option')[0] as HTMLButtonElement).click();
    (page.querySelectorAll('.option')[1] as HTMLButtonElement).click();
    const champ = page.querySelector('input') as HTMLInputElement;
    champ.value = 'toute l’année';
    champ.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (page.querySelector('.valider') as HTMLButtonElement).click();

    expect(respond).toHaveBeenCalledWith('2026-08 ; toute l’année');
  });
});
