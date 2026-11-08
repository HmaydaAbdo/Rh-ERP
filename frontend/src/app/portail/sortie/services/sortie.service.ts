import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SortiesMois } from '../models/sortie.model';

/** Lecture des sorties d'un mois (permission `EMPLOYEE_READ`). */
@Injectable({ providedIn: 'root' })
export class SortieService {
  private readonly http = inject(HttpClient);

  sortiesDuMois(periode: string): Observable<SortiesMois> {
    return this.http.post<SortiesMois>('employees/sorties-mois', { periode });
  }
}
