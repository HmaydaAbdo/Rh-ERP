import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { normaliser } from '@shared/text/recherche';
import { ChantierService } from '../services/chantier.service';
import { ChantierCarte, NATURE_CHANTIER_OPTIONS, NatureChantier } from '../models/chantier.model';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SelectComponent, SelectOption } from '../../../shared/ui/select/select.component';

import { ChantierCarteComponent } from './chantier-carte.component';

/** Page « Carte des chantiers » : la carte occupe toute la zone de contenu. Accès réservé à `CARTE_READ` (voir `chantier.routes.ts`). */
@Component({
  selector: 'app-chantier-carte-page',
  imports: [ChantierCarteComponent, ButtonComponent, IconComponent, SelectComponent, FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './chantier-carte-page.component.html',
  styleUrl: './chantier-carte-page.component.scss'
})
export class ChantierCartePageComponent {
  private readonly service = inject(ChantierService);
  private readonly destruction = inject(DestroyRef);
  protected readonly chantiers = signal<ChantierCarte[]>([]);
  protected readonly naturesChoisies = signal<NatureChantier[]>([]);
  protected readonly natures: SelectOption<NatureChantier>[] = NATURE_CHANTIER_OPTIONS;
  private readonly recherche = signal({ texte: '' });
  protected readonly formulaire = form(this.recherche, (chemin) => debounce(chemin.texte, 300));
  protected readonly chantiersFiltres = computed(() => {
    const natures = this.naturesChoisies();
    const terme = normaliser(this.recherche().texte.trim());
    return this.chantiers().filter((chantier) => {
      const correspondAuTerme = terme === '' || normaliser(`${chantier.code} ${chantier.nom ?? ''} ${chantier.designation ?? ''}`).includes(terme);
      return correspondAuTerme && (natures.length === 0 || natures.includes(chantier.nature));
    });
  });
  protected readonly chargement = signal(true);
  protected readonly erreur = signal(false);

  constructor() { this.charger(); }

  protected charger(): void {
    this.chargement.set(true);
    this.erreur.set(false);
    this.service.carte().pipe(takeUntilDestroyed(this.destruction), finalize(() => this.chargement.set(false)))
      .subscribe({ next: (points) => this.chantiers.set(points), error: () => this.erreur.set(true) });
  }

  protected choisirNatures(valeur: unknown): void {
    const choisies = Array.isArray(valeur) ? valeur : [];
    this.naturesChoisies.set(NATURE_CHANTIER_OPTIONS.map((option) => option.value).filter((nature) => choisies.includes(nature)));
  }
}
