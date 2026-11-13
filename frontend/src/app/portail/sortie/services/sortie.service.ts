import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { MouvementRequete } from '../../mouvement/mouvement-filtres';
import { SortiesMois } from '../models/sortie.model';

/** Lecture des sorties d'un mois (`EMPLOYEE_READ`) et export PDF des mêmes sorties (`EMPLOYEE_EXPORT`). */
@Injectable({ providedIn: 'root' })
export class SortieService {
  private readonly http = inject(HttpClient);

  sortiesDuMois(requete: MouvementRequete): Observable<SortiesMois> {
    return this.http.post<SortiesMois>('employees/sorties-mois', requete);
  }

  /** Le PDF regroupé par chantier de ce que `sortiesDuMois` renvoie pour la même requête. */
  exporterPdf(requete: MouvementRequete): Observable<Blob> {
    return this.http.post('employees/sorties-mois/pdf', requete, { responseType: 'blob' });
  }
}
