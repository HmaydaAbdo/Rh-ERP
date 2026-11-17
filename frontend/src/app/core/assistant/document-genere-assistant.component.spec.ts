import { TestBed } from '@angular/core/testing';

import { lireDocumentGenere } from './document-genere-assistant';
import { DocumentGenereAssistantComponent } from './document-genere-assistant.component';
import { FichiersAssistant } from './fichiers-assistant.service';

const TEXTE =
  'Fichier prêt : Essai.xlsx (6 Ko). Un bouton « Télécharger » s’affiche dans la discussion ; ne donne aucun chemin ni lien dans ta réponse.';

describe('lireDocumentGenere', () => {
  it('lit le nom dans un texte, un contenu MCP ou une enveloppe', () => {
    const attendu = { nom: 'Essai.xlsx', chemin: '/espace/documents/Essai.xlsx' };
    expect(lireDocumentGenere(TEXTE)).toEqual(attendu);
    expect(lireDocumentGenere([{ type: 'text', text: TEXTE }])).toEqual(attendu);
    expect(lireDocumentGenere({ content: TEXTE })).toEqual(attendu);
    expect(lireDocumentGenere({ resultat: TEXTE })).toEqual(attendu);
  });

  it('garde les accents et les espaces du nom', () => {
    expect(lireDocumentGenere('Fichier prêt : Note_de_service.docx (13 Ko). …')?.nom).toBe('Note_de_service.docx');
  });

  it('ignore une erreur, un résultat vide ou un nom avec un dossier', () => {
    expect(lireDocumentGenere('Fichier trop gros (25 Mo au plus).')).toBeNull();
    expect(lireDocumentGenere(undefined)).toBeNull();
    expect(lireDocumentGenere('Fichier prêt : ../secret.docx (1 Ko).')).toBeNull();
  });
});

describe('DocumentGenereAssistantComponent', () => {
  function monter(appel: unknown, telecharger = vi.fn().mockResolvedValue(undefined)) {
    TestBed.configureTestingModule({ providers: [{ provide: FichiersAssistant, useValue: { telecharger } }] });
    const fixture = TestBed.createComponent(DocumentGenereAssistantComponent);
    fixture.componentRef.setInput('toolCall', appel);
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement, telecharger };
  }

  it('propose le téléchargement du document créé, sans montrer le chemin', async () => {
    const { fixture, page, telecharger } = monter({ status: 'complete', args: {}, result: TEXTE });

    expect(page.textContent).toContain('Télécharger Essai.xlsx');
    expect(page.textContent).not.toContain('/espace');
    (page.querySelector('.telecharger') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(telecharger).toHaveBeenCalledWith('/espace/documents/Essai.xlsx');
  });

  it('indique la création en cours tant que l’outil n’a pas répondu', () => {
    const { page } = monter({ status: 'executing', args: {}, result: undefined, respond: vi.fn() });

    expect(page.querySelector('.telecharger')).toBeNull();
    expect(page.textContent).toContain('Création du document');
  });

  it('n’affiche aucun bouton quand la création a échoué', () => {
    const { page } = monter({ status: 'complete', args: {}, result: 'Le fichier n’a pas pu être créé.' });

    expect(page.querySelector('.telecharger')).toBeNull();
  });

  it('signale un téléchargement refusé', async () => {
    const { fixture, page } = monter({ status: 'complete', args: {}, result: TEXTE }, vi.fn().mockRejectedValue(new Error('404')));

    (page.querySelector('.telecharger') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('a échoué');
  });
});
