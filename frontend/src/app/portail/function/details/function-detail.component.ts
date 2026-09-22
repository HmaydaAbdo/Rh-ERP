import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { Function } from '../models/function.model';
import { FunctionService } from '../services/function.service';

@Component({
  selector: 'app-function-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule],
  templateUrl: './function-detail.component.html',
  styleUrl: './function-detail.component.scss'
})
export class FunctionDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly functionService = inject(FunctionService);

  fonction: Function | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.functionService.getById(id).subscribe((fonction) => (this.fonction = fonction));
  }
}
