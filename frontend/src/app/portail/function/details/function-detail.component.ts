
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { Function } from '../models/function.model';
import { FunctionService } from '../services/function.service';
import { AuthService } from '../../../core/auth/services/auth.service';

@Component({
    selector: 'app-function-detail',
    imports: [RouterLink, ButtonModule],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './function-detail.component.html'
})
export class FunctionDetailComponent implements OnInit {
  private readonly authService = inject(AuthService);

  canWrite(): boolean {
    return this.authService.hasPermission('FUNCTION_WRITE');
  }

  private readonly route = inject(ActivatedRoute);
  private readonly functionService = inject(FunctionService);

  fonction: Function | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.functionService.getById(id).subscribe((fonction) => (this.fonction = fonction));
  }
}
