import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/** Affichée quand l'utilisateur n'a pas la permission requise par un écran (voir `permissionGuard`). */
@Component({
    selector: 'app-access-denied',
    imports: [RouterLink, IconComponent, ButtonComponent],
    template: `
    <div class="app-page app-page--narrow">
      <section class="grid justify-items-start gap-4 py-8" aria-labelledby="acces-refuse-titre">
        <span class="grid size-12 place-items-center rounded-md border border-border bg-primary-soft text-primary"><stp-icon name="circle-alert" size="1.5rem" /></span>
        <h1 id="acces-refuse-titre" class="m-0 text-page-title font-semibold">Accès refusé</h1>
        <p class="m-0 max-w-prose text-muted">
          Votre profil ne dispose pas de la permission nécessaire pour consulter cet écran. Contactez un administrateur si vous pensez que c'est une erreur.
        </p>
        <a stp-button variant="secondary" icon="arrow-left" routerLink="/">Retour à l'accueil</a>
      </section>
    </div>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccessDeniedComponent {}
