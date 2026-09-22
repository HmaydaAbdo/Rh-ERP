import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { Page } from '../models/page.model';
import { ChantierReference } from './chantier-reference.model';

@Injectable({ providedIn: 'root' })
export class ChantierReferenceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/chantiers';

  listActive(): Observable<ChantierReference[]> {
    const params = new HttpParams().set('size', 200).set('sort', 'code,asc');

    return this.http
      .post<Page<ChantierReference>>(`${this.baseUrl}/search`, { actif: true }, { params })
      .pipe(map((page) => page.content));
  }
}
