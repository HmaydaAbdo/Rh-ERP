import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { EquipeImportResult } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';

@Component({
  selector: 'app-equipe-actions',
  imports: [RouterLink, ButtonComponent, DialogComponent, SplitButtonComponent],
  templateUrl: './equipe-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.equipe-actions__fichier { display: none; }`
})
export class EquipeActionsComponent {
  readonly importe = output<void>();
  private readonly equipeService = inject(EquipeService);
  private readonly notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly canWrite = computed(() => this.authService.hasPermission('EQUIPE_WRITE'));
  protected readonly canImport = computed(() => this.authService.hasPermission('EQUIPE_IMPORT'));
  protected readonly importing = signal(false);
  protected readonly downloading = signal(false);
  protected readonly result = signal<EquipeImportResult | null>(null);
  protected readonly resultOpen = signal(false);
  protected readonly menuImport: MenuAction[] = [{
    label: 'Télécharger le modèle Excel', icon: 'file-spreadsheet',
    command: () => { if (!this.downloading()) this.telechargerModele(); }
  }];

  protected choisirFichier(): void { this.fileInput().nativeElement.click(); }

  protected telechargerModele(): void {
    this.downloading.set(true);
    this.equipeService.telechargerModele().pipe(finalize(() => this.downloading.set(false))).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'Modele_Import_Equipes.xlsx';
      lien.click();
      window.URL.revokeObjectURL(url);
    });
  }

  protected fichierSelectionne(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.importing.set(true);
    this.equipeService.importer(file).pipe(finalize(() => this.importing.set(false))).subscribe({
      next: (result) => this.afficherResultat(result),
      error: (error: HttpErrorResponse) => {
        const result = error.error as EquipeImportResult | null;
        if (result && Array.isArray(result.lignesIgnorees)) this.afficherResultat(result);
      }
    });
  }

  private afficherResultat(result: EquipeImportResult): void {
    this.result.set(result);
    this.resultOpen.set(true);
    this.notificationService.add({
      severity: result.ignores ? 'error' : 'success',
      summary: result.ignores ? 'Import rejeté' : 'Import terminé',
      detail: `${result.crees} créée(s) sur ${result.totalLignes} ligne(s)`,
      life: 6000
    });
    if (!result.ignores) this.importe.emit();
  }
}
