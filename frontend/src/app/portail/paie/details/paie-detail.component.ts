import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { AuthService } from '../../../core/auth/services/auth.service';
import { AuditHistoriqueComponent } from '../../audit/historique/audit-historique.component';

@Component({
    selector: 'app-paie-detail',
    imports: [CommonModule, RouterLink, ButtonModule, DialogModule, AuditHistoriqueComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './paie-detail.component.html'
})
export class PaieDetailComponent implements OnInit {
  private readonly authService = inject(AuthService);

  canWrite(): boolean {
    return this.authService.hasPermission('PAIE_WRITE');
  }

  canViewHistory(): boolean {
    return this.authService.hasPermission('AUDIT_READ');
  }

  historiqueOuvert = false;

  private readonly route = inject(ActivatedRoute);
  private readonly paieService = inject(PaieService);

  paie: Paie | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.paieService.getById(id).subscribe((paie) => (this.paie = paie));
  }
}
