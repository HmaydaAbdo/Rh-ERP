import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../components/lazy-select/lazy-select.model';
import { Page } from '../models/page.model';
import { EmployeeReference } from './employee-reference.model';

export type EmployeeReferenceOption = EmployeeReference & { displayLabel: string };

function avecLibelle(employee: EmployeeReference): EmployeeReferenceOption {
  return { ...employee, displayLabel: `${employee.nomPrenom} — ${employee.cin}` };
}

/** Source de données du sélecteur générique (voir `shared/components/lazy-select`) pour l'employé
 * d'un bulletin de paie — les employés sont potentiellement nombreux (contrairement à
 * Function/Chantier), la pagination/recherche serveur est donc indispensable ici, pas seulement une
 * conséquence de la convention. `displayLabel` (nom + CIN) désambiguïse les homonymes, absent du
 * modèle `EmployeeReference` partagé pour ne pas l'imposer aux autres consommateurs. */
@Injectable({ providedIn: 'root' })
export class EmployeeReferenceService implements LazySelectSource<EmployeeReferenceOption> {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'employees';

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<EmployeeReferenceOption>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'nomPrenom,asc');
    const criteria = { nomPrenom: search || undefined };

    return this.http
      .post<Page<EmployeeReference>>(`${this.baseUrl}/search`, criteria, { params })
      .pipe(map((result) => ({ items: result.content.map(avecLibelle), totalRecords: result.page.totalElements })));
  }

  fetchById(id: number | string): Observable<EmployeeReferenceOption> {
    return this.http.get<EmployeeReference>(`${this.baseUrl}/${id}`).pipe(map(avecLibelle));
  }
}
