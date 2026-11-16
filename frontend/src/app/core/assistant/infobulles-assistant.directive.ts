import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Infobulles de l'espace Staport Intelligence : chaque bouton qui a un nom accessible (`aria-label`) mais pas de `title`
 * reçoit ce nom en infobulle. Couvre aussi les boutons de la discussion CopilotKit (ajouter un fichier, dicter, envoyer…),
 * rendus par la bibliothèque, dont les libellés sont déjà ceux du français (`chatInputToolbar…Label`). Un `title` posé
 * explicitement n'est jamais écrasé.
 */
@Directive({ selector: '[appInfobulles]' })
export class InfobullesAssistantDirective implements OnInit, OnDestroy {
  private readonly racine = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private observateur?: MutationObserver;

  ngOnInit(): void {
    this.appliquer(this.racine);
    this.observateur = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          this.appliquer(mutation.target);
        }
        mutation.addedNodes.forEach((noeud) => this.appliquer(noeud));
      }
    });
    this.observateur.observe(this.racine, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label'] });
  }

  ngOnDestroy(): void {
    this.observateur?.disconnect();
  }

  private appliquer(noeud: Node): void {
    if (!(noeud instanceof HTMLElement)) {
      return;
    }
    const cibles = noeud.matches('button') ? [noeud, ...noeud.querySelectorAll('button')] : [...noeud.querySelectorAll('button')];
    for (const bouton of cibles) {
      const nom = bouton.getAttribute('aria-label');
      if (nom && !bouton.hasAttribute('title')) {
        bouton.setAttribute('title', nom);
      }
    }
  }
}
