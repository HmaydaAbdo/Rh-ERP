import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { Page } from '../models/page.model';
import { EmployeeReference } from './employee-reference.model';

@Injectable({ providedIn: 'root' })
export class EmployeeReferenceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/employees';

  /**
   * Recherche par nom pour un champ de saisie assistée — les employés étant trop nombreux pour
   * une liste chargée entièrement (contrairement à Function/Chantier), la recherche se fait par
   * page réduite au fil de la frappe plutôt qu'un chargement complet en mémoire.
   */
  rechercherParNom(nomPrenom: string): Observable<EmployeeReference[]> {
    const params = new HttpParams().set('page', 0).set('size', 20).set('sort', 'nomPrenom,asc');

    return this.http
      .post<Page<EmployeeReference>>(`${this.baseUrl}/search`, { nomPrenom }, { params })
      .pipe(map((page) => page.content));
  }
}
