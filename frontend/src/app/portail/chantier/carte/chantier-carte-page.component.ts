import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ChantierService } from '../services/chantier.service';
import { ChantierCarte, NATURE_CHANTIER_OPTIONS, NatureChantier } from '../models/chantier.model';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { SelectComponent, SelectOption } from '../../../shared/ui/select/select.component';

import { ChantierCarteComponent } from './chantier-carte.component';

/** Page « Carte des chantiers » : la carte occupe toute la zone de contenu. Accès réservé à `CARTE_READ` (voir `chantier.routes.ts`). */
@Component({
  selector: 'app-chantier-carte-page',
  imports: [ChantierCarteComponent, ButtonComponent, SelectComponent],
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
  protected readonly chantiersFiltres = computed(() => {
    const natures = this.naturesChoisies();
    return natures.length === 0 ? this.chantiers() : this.chantiers().filter((chantier) => natures.includes(chantier.nature));
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
