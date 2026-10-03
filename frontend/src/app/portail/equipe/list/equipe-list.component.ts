import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';

const DEBOUNCE_RECHERCHE_MS = 300;

@Component({
  selector: 'app-equipe-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TableModule, ButtonModule, InputTextModule, ConfirmDialogModule],
  providers: [ConfirmationService],
  templateUrl: './equipe-list.component.html',
  styleUrl: './equipe-list.component.scss'
})
export class EquipeListComponent implements OnInit {
  private readonly equipeService = inject(EquipeService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  canWrite(): boolean {
    return this.authService.hasPermission('EQUIPE_WRITE');
  }

  canDelete(): boolean {
    return this.authService.hasPermission('EQUIPE_DELETE');
  }

  equipes: Equipe[] = [];
  totalRecords = 0;
  loading = false;
  deletingId: number | null = null;

  readonly filterForm = this.fb.group({
    code: [''],
    libelle: ['']
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'code,asc';

  ngOnInit(): void {
    this.filterForm.valueChanges
      .pipe(
        debounceTime(DEBOUNCE_RECHERCHE_MS),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      )
      .subscribe(() => this.onSearch());
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.lastSize;
    const page = size > 0 ? Math.floor((event.first ?? 0) / size) : 0;
    const sortField = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    const sort = sortField ? `${sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.lastPage = page;
    this.lastSize = size;
    this.lastSort = sort;

    this.fetchPage();
  }

  onSearch(): void {
    this.lastPage = 0;
    this.fetchPage();
  }

  onResetFilters(): void {
    this.filterForm.reset(undefined, { emitEvent: false });
    this.onSearch();
  }

  onView(equipe: Equipe): void {
    this.router.navigate(['/equipes', equipe.id]);
  }

  onEdit(equipe: Equipe): void {
    this.router.navigate(['/equipes', equipe.id, 'edit']);
  }

  onDelete(equipe: Equipe): void {
    this.confirmationService.confirm({
      header: 'Supprimer cette équipe',
      message: `Confirmez-vous la suppression de ${equipe.code} ?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteEquipe(equipe)
    });
  }

  private deleteEquipe(equipe: Equipe): void {
    this.deletingId = equipe.id;
    this.equipeService
      .delete(equipe.id)
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Équipe supprimée', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading = true;
    const criteria = this.filterForm.getRawValue();

    this.equipeService
      .search(
        {
          code: criteria.code || undefined,
          libelle: criteria.libelle || undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((result) => {
        this.equipes = result.content;
        this.totalRecords = result.totalElements;
      });
  }
}
