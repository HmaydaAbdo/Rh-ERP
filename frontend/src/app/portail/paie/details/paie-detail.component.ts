import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

@Component({
  selector: 'app-paie-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule],
  templateUrl: './paie-detail.component.html',
  styleUrl: './paie-detail.component.scss'
})
export class PaieDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly paieService = inject(PaieService);

  paie: Paie | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.paieService.getById(id).subscribe((paie) => (this.paie = paie));
  }
}
