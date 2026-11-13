import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { MouvementRequete } from '../../mouvement/mouvement-filtres';
import { EntrantsMois } from '../models/entrant.model';

/** Lecture des entrants d'un mois (`EMPLOYEE_READ`) et export PDF des mêmes entrants (`EMPLOYEE_EXPORT`). */
@Injectable({ providedIn: 'root' })
export class EntrantService {
  private readonly http = inject(HttpClient);

  entrantsDuMois(requete: MouvementRequete): Observable<EntrantsMois> {
    return this.http.post<EntrantsMois>('employees/entrants-mois', requete);
  }

  /** Le PDF regroupé par chantier de ce que `entrantsDuMois` renvoie pour la même requête. */
  exporterPdf(requete: MouvementRequete): Observable<Blob> {
    return this.http.post('employees/entrants-mois/pdf', requete, { responseType: 'blob' });
  }
}
