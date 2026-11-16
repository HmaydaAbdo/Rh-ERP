import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '../../shared/ui/button/button.directive';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/** Affichée pour une adresse qui ne correspond à aucun écran (route `**`) : sans elle, l'écran restait vide. */
@Component({
  selector: 'app-page-introuvable',
  imports: [RouterLink, IconComponent, ButtonComponent],
  template: `
    <div class="app-page app-page--narrow">
      <section class="grid justify-items-start gap-4 py-8" aria-labelledby="page-introuvable-titre">
        <span class="grid size-12 place-items-center rounded-md border border-border bg-primary-soft text-primary"><stp-icon name="circle-alert" size="1.5rem" /></span>
        <h1 id="page-introuvable-titre" class="m-0 text-page-title font-semibold">Page introuvable</h1>
        <p class="m-0 max-w-prose text-muted">
          Cette adresse ne correspond à aucun écran. Elle a peut-être changé ou contient une faute de frappe.
        </p>
        <a stp-button variant="secondary" icon="arrow-left" routerLink="/">Retour à l'accueil</a>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageIntrouvableComponent {}
