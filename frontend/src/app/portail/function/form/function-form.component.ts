import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { FunctionService } from '../services/function.service';

@Component({
  selector: 'app-function-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule],
  templateUrl: './function-form.component.html',
  styleUrl: './function-form.component.scss'
})
export class FunctionFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly functionService = inject(FunctionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  functionId: number | null = null;
  saving = false;

  readonly form = this.fb.group({
    libelle: ['', [Validators.required, Validators.maxLength(100)]]
  });

  get isEditMode(): boolean {
    return this.functionId !== null;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.functionId = Number(idParam);
      this.functionService.getById(this.functionId).subscribe((fonction) => {
        this.form.patchValue({
          libelle: fonction.libelle
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
    const dto = { libelle: raw.libelle! };

    this.saving = true;

    const request$ = this.isEditMode
      ? this.functionService.update(this.functionId!, dto)
      : this.functionService.create(dto);

    request$
      .pipe(finalize(() => (this.saving = false)))
      .subscribe((fonction) => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode ? 'Fonction modifiée' : 'Fonction créée',
          life: 4000
        });
        this.router.navigate(['/functions', fonction.id]);
      });
  }
}
