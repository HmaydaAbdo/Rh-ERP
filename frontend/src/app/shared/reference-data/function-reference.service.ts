import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { Page } from '../models/page.model';
import { FunctionReference } from './function-reference.model';

@Injectable({ providedIn: 'root' })
export class FunctionReferenceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/functions';

  list(): Observable<FunctionReference[]> {
    const params = new HttpParams().set('size', 200).set('sort', 'libelle,asc');

    return this.http
      .post<Page<FunctionReference>>(`${this.baseUrl}/search`, {}, { params })
      .pipe(map((page) => page.content));
  }
}
