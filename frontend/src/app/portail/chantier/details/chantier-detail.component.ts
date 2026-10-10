
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';
import { AuthService } from '../../../core/auth/services/auth.service';

@Component({
    selector: 'app-chantier-detail',
    imports: [RouterLink, ButtonModule, TagModule],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './chantier-detail.component.html'
})
export class ChantierDetailComponent implements OnInit {
  private readonly authService = inject(AuthService);

  canWrite(): boolean {
    return this.authService.hasPermission('CHANTIER_WRITE');
  }

  private readonly route = inject(ActivatedRoute);
  private readonly chantierService = inject(ChantierService);

  chantier: Chantier | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.chantierService.getById(id).subscribe((chantier) => (this.chantier = chantier));
  }
}
