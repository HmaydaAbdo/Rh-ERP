import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';

@Component({
  selector: 'app-chantier-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule, TagModule],
  templateUrl: './chantier-detail.component.html',
  styleUrl: './chantier-detail.component.scss'
})
export class ChantierDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly chantierService = inject(ChantierService);

  chantier: Chantier | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.chantierService.getById(id).subscribe((chantier) => (this.chantier = chantier));
  }
}
