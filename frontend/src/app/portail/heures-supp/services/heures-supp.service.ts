import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { HeuresSupp, HeuresSuppAnalytique, HeuresSuppImportAnalyse, HeuresSuppImportCorrections, HeuresSuppExportMode, HeuresSuppForfaitPrecedent, HeuresSuppImportForfait, HeuresSuppImportPrerequis, HeuresSuppImportResult, HeuresSuppSearchCriteria } from '../models/heures-supp.model';

@Injectable({ providedIn: 'root' })
export class HeuresSuppService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'heures-supp';

  search(criteria: HeuresSuppSearchCriteria, page = 0, size = 20, sort = 'periode,desc'): Observable<Page<HeuresSupp>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', sort);
    return this.http.post<Page<HeuresSupp>>(`${this.baseUrl}/search`, criteria, { params });
  }

  get(id: number): Observable<HeuresSupp> { return this.http.get<HeuresSupp>(`${this.baseUrl}/${id}`); }

  modifier(id: number, modification: { version: number; heuresSupplementaires: number | null; forfaitDh: number | null }): Observable<HeuresSupp> {
    return this.http.put<HeuresSupp>(`${this.baseUrl}/${id}`, modification);
  }

  creer(ligne: { employeeId: number; periode: string; chantierId: number; heuresSupplementaires: number | null; forfaitDh: number | null }): Observable<HeuresSupp> {
    return this.http.post<HeuresSupp>(this.baseUrl, ligne);
  }

  supprimer(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/${id}`); }

  supprimerMois(periode: string, nombreAttendu: number): Observable<number> {
    return this.http.post<number>(`${this.baseUrl}/suppression-mois`, { periode, nombreAttendu });
  }

  supprimerGroupe(criteres: HeuresSuppSearchCriteria, nombreAttendu: number): Observable<number> {
    return this.http.post<number>(`${this.baseUrl}/suppression-groupe`, { ...criteres, nombreAttendu });
  }

  analyser(criteria: HeuresSuppSearchCriteria): Observable<HeuresSuppAnalytique> {
    return this.http.post<HeuresSuppAnalytique>(`${this.baseUrl}/analytique`, criteria);
  }

  periodes(): Observable<string[]> { return this.http.get<string[]>(`${this.baseUrl}/periodes`); }

  verifierPrerequis(periode: string, chantierId: number): Observable<HeuresSuppImportPrerequis> {
    return this.http.get<HeuresSuppImportPrerequis>(`${this.baseUrl}/import/prerequis`, { params: { periode, chantierId } });
  }

  /** Forfaits du dernier mois qui en comptait pour le chantier, avant le mois importé. */
  forfaitsPrecedents(periode: string, chantierId: number): Observable<HeuresSuppForfaitPrecedent[]> {
    return this.http.get<HeuresSuppForfaitPrecedent[]>(`${this.baseUrl}/import/forfaits-precedents`, { params: { periode, chantierId } });
  }

  /** Rapport PDF de toutes les lignes du périmètre filtré, recherché et trié de la vue Tabulaire. */
  exporterPdf(criteria: HeuresSuppSearchCriteria, sort: string | undefined, mode: HeuresSuppExportMode): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/export/pdf`, { ...criteria, tri: sort, mode }, { responseType: 'blob' });
  }

  telechargerModele(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/import/modele`, { responseType: 'blob' });
  }

  analyserImport(file: File, periode: string, chantierId: number, forfaits: HeuresSuppImportForfait[] = []): Observable<HeuresSuppImportAnalyse> {
    const data = this.importForm(file, forfaits);
    return this.http.post<HeuresSuppImportAnalyse>(`${this.baseUrl}/import/analyse`, data, { params: { periode, chantierId } });
  }

  corrigerImport(file: File, periode: string, chantierId: number, corrections: HeuresSuppImportCorrections, forfaits: HeuresSuppImportForfait[] = []): Observable<HeuresSuppImportAnalyse> {
    const data = this.importForm(file, forfaits);
    data.append('corrections', JSON.stringify(corrections));
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
    if (forfaits.length) data.append('forfaits', JSON.stringify({ forfaits }));
    return data;
  }
}
