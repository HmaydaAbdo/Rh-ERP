import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { DropdownModule } from 'primeng/dropdown';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { ChantierService } from '../services/chantier.service';

const ACTIF_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Actif', value: true },
  { label: 'Inactif', value: false }
];

@Component({
  selector: 'app-chantier-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, DropdownModule, MessageModule],
  templateUrl: './chantier-form.component.html',
  styleUrl: './chantier-form.component.scss'
})
export class ChantierFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly chantierService = inject(ChantierService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  readonly actifOptions = ACTIF_OPTIONS;

  chantierId: number | null = null;
  saving = false;
  issuDeLErp = false;

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(100)]],
    designation: ['', [Validators.required, Validators.maxLength(500)]],
    actif: [true, Validators.required]
  });

  get isEditMode(): boolean {
    return this.chantierId !== null;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.chantierId = Number(idParam);
      this.chantierService.getById(this.chantierId).subscribe((chantier) => {
        this.issuDeLErp = chantier.sourceErp;
        this.form.patchValue({
          code: chantier.code,
          designation: chantier.designation,
          actif: chantier.actif
        });
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const dto = { code: raw.code!, designation: raw.designation! };

    this.saving = true;

    const request$ = this.isEditMode
      ? this.chantierService.update(this.chantierId!, { ...dto, actif: raw.actif! })
      : this.chantierService.create(dto);

    request$
      .pipe(finalize(() => (this.saving = false)))
      .subscribe((chantier) => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode ? 'Chantier modifié' : 'Chantier créé',
          life: 4000
        });
        this.router.navigate(['/chantiers', chantier.id]);
      });
  }
}
