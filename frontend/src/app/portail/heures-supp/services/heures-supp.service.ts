import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { HeuresSupp, HeuresSuppAnalytique, HeuresSuppImportAnalyse, HeuresSuppImportCorrections, HeuresSuppImportForfait, HeuresSuppImportPrerequis, HeuresSuppImportResult, HeuresSuppSearchCriteria } from '../models/heures-supp.model';

@Injectable({ providedIn: 'root' })
export class HeuresSuppService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'heures-supp';

  search(criteria: HeuresSuppSearchCriteria, page = 0, size = 20): Observable<Page<HeuresSupp>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'periode,desc');
    return this.http.post<Page<HeuresSupp>>(`${this.baseUrl}/search`, criteria, { params });
  }

  analyser(criteria: HeuresSuppSearchCriteria): Observable<HeuresSuppAnalytique> {
    return this.http.post<HeuresSuppAnalytique>(`${this.baseUrl}/analytique`, criteria);
  }

  periodes(): Observable<string[]> { return this.http.get<string[]>(`${this.baseUrl}/periodes`); }

  verifierPrerequis(periode: string, chantierId: number): Observable<HeuresSuppImportPrerequis> {
    return this.http.get<HeuresSuppImportPrerequis>(`${this.baseUrl}/import/prerequis`, { params: { periode, chantierId } });
  }

  analyserImport(file: File, periode: string, chantierId: number, forfaits: HeuresSuppImportForfait[] = []): Observable<HeuresSuppImportAnalyse> {
    const data = this.importForm(file, forfaits);
    return this.http.post<HeuresSuppImportAnalyse>(`${this.baseUrl}/import/analyse`, data, { params: { periode, chantierId } });
  }

  corrigerImport(file: File, periode: string, chantierId: number, corrections: HeuresSuppImportCorrections, forfaits: HeuresSuppImportForfait[] = []): Observable<HeuresSuppImportAnalyse> {
    const data = this.importForm(file, forfaits);
    data.append('corrections', new Blob([JSON.stringify(corrections)], { type: 'application/json' }));
    return this.http.post<HeuresSuppImportAnalyse>(`${this.baseUrl}/import/corrections`, data, { params: { periode, chantierId } });
  }

  importer(file: File, periode: string, chantierId: number, forfaits: HeuresSuppImportForfait[] = []): Observable<HeuresSuppImportResult> {
    const data = this.importForm(file, forfaits);
    return this.http.post<HeuresSuppImportResult>(`${this.baseUrl}/import`, data, { params: { periode, chantierId } });
  }

  remplacer(file: File, periode: string, chantierId: number, forfaits: HeuresSuppImportForfait[] = []): Observable<HeuresSuppImportResult> {
    return this.http.post<HeuresSuppImportResult>(`${this.baseUrl}/import/remplacement`, this.importForm(file, forfaits), { params: { periode, chantierId } });
  }

  private importForm(file: File, forfaits: HeuresSuppImportForfait[]): FormData {
    const data = new FormData(); data.append('file', file);
    if (forfaits.length) data.append('forfaits', new Blob([JSON.stringify({ forfaits })], { type: 'application/json' }));
    return data;
  }
}
