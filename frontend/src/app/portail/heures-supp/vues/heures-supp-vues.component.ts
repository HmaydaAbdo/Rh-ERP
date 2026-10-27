import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { CollectionShellComponent, CollectionShellConfig } from '../../../shared/components/collection-shell/collection-shell.component';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';
import { HeuresSuppService } from '../services/heures-supp.service';

const CONFIG: CollectionShellConfig = {
  titre: 'Heures supplémentaires',
  libelleVue: 'Vues des heures supplémentaires',
  vues: [
    { libelle: 'Tabulaire', icone: 'table', lien: '/heures-supp' },
    { libelle: 'Cartes', icone: 'layout-grid', lien: '/heures-supp/cartes' },
    { libelle: 'Analytique', icone: 'chart-column', lien: '/heures-supp/analytique' }
  ]
};

@Component({
  selector: 'app-heures-supp-vues',
  imports: [CollectionShellComponent, SplitButtonComponent, MonthInputComponent],
  template: `
    <app-collection-shell [configuration]="configuration">
      <stp-split-button collection-actions label="Importer un chantier" icon="upload" moreLabel="Autres actions d’import" [items]="menuImport" [disabled]="telechargementModele()" (clicked)="ouvrirImport()" />
      <div collection-filters class="heures-supp-filtres">
        <label for="hs-periode">Période <stp-month-input inputId="hs-periode" ariaLabel="Période des heures supplémentaires" [value]="mois()" (valueChange)="choisirMois($event)" /></label>
      </div>
    </app-collection-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppVuesComponent {
  protected readonly configuration = CONFIG;
  protected readonly mois = signal<Date | null>(null);
  protected readonly telechargementModele = signal(false);
  protected readonly menuImport: MenuAction[] = [{
    label: 'Télécharger le modèle Excel', icon: 'file-spreadsheet', command: () => this.telechargerModele()
  }];
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(HeuresSuppService);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const valeur = params.get('periode');
      this.mois.set(valeur && /^\d{4}-(0[1-9]|1[0-2])$/.test(valeur) ? new Date(Number(valeur.slice(0, 4)), Number(valeur.slice(5, 7)) - 1, 1) : null);
    });
  }

  protected choisirMois(value: Date | null): void {
    const periode = value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}` : null;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { periode, page: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected ouvrirImport(): void {
    void this.router.navigate(['/heures-supp/import']);
  }

  private telechargerModele(): void {
    if (this.telechargementModele()) return;
    this.telechargementModele.set(true);
    this.service.telechargerModele().pipe(finalize(() => this.telechargementModele.set(false))).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'Modele_Heures_Supplementaires.xlsx';
      lien.click();
      window.URL.revokeObjectURL(url);
    });
  }
}
