
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { AuthService } from '../../../core/auth/services/auth.service';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';

@Component({
    selector: 'app-equipe-detail',
    imports: [RouterLink, ButtonModule],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './equipe-detail.component.html'
})
export class EquipeDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly equipeService = inject(EquipeService);
  private readonly authService = inject(AuthService);

  equipe: Equipe | null = null;

  canWrite(): boolean {
    return this.authService.hasPermission('EQUIPE_WRITE');
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.equipeService.getById(id).subscribe((equipe) => (this.equipe = equipe));
  }
}
