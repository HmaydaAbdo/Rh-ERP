import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { EquipeReference } from '../../../shared/reference-data/equipe-reference.model';
import {
  Paie,
  PaieAnalytique,
  PaieChantierPeriode,
  PaieCreateRequest,
  PaieExportRequest,
  PaieImportAnalyse,
  PaieImportCorrections,
  PaieImportResult,
  PaieMaterielTableau,
  PaieParcours,
  PaiePeriodeResume,
  PaieSearchCriteria,
  PaieSuppression,
  PaieRestauration,
  PaieSuppressionGroupeRequest,
  PaieUpdateRequest,
  PaieRapportPdfRequest
} from '../models/paie.model';

export interface PaiePageRequest {
  page: number;
  size: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class PaieService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'paie';

  search(criteria: PaieSearchCriteria, pageRequest: PaiePageRequest): Observable<Page<Paie>> {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }

    return this.http.post<Page<Paie>>(`${this.baseUrl}/search`, criteria, { params });
  }

  /** Page des chantiers qui possèdent une paie pour le mois sélectionné dans les filtres. */
  rechercherOptionsChantiers(periode: string, page: number, size: number, recherche: string): Observable<Page<ChantierReference>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'code,asc');
    return this.http.post<Page<ChantierReference>>(
      `${this.baseUrl}/options/chantiers`, { periode, recherche: recherche || null }, { params }
    );
  }

  /** Page des équipes des chantiers choisis pour le mois sélectionné dans les filtres. */
  rechercherOptionsEquipes(periode: string, chantierIds: number[], page: number, size: number, recherche: string): Observable<Page<EquipeReference>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'code,asc');
    return this.http.post<Page<EquipeReference>>(
      `${this.baseUrl}/options/equipes`, { periode, chantierIds, recherche: recherche || null }, { params }
    );
  }

  getById(id: number): Observable<Paie> {
    return this.http.get<Paie>(`${this.baseUrl}/${id}`);
  }

  create(dto: PaieCreateRequest): Observable<Paie> {
    return this.http.post<Paie>(this.baseUrl, dto);
  }

  update(id: number, dto: PaieUpdateRequest): Observable<Paie> {
    return this.http.put<Paie>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /** Supprime d'un coup un groupe de bulletins ; refusé (409) si son nombre n'est plus celui confirmé. */
  supprimerGroupe(requete: PaieSuppressionGroupeRequest): Observable<PaieSuppression> {
    return this.http.post<PaieSuppression>(`${this.baseUrl}/suppression`, requete);
  }

  /** Restaure un groupe supprimé depuis son entrée d'audit ; tout le groupe est refusé en cas de conflit. */
  restaurerDepuisAudit(idEntreeAudit: number): Observable<PaieRestauration> {
    return this.http.post<PaieRestauration>(`${this.baseUrl}/restauration/${idEntreeAudit}`, {});
  }

  /** Parcours d'un employé : indicateurs, mois de paie et événements (entrée, changements, départs, retours). */
  parcours(employeId: number): Observable<PaieParcours> {
    return this.http.get<PaieParcours>(`${this.baseUrl}/employes/${employeId}/parcours`);
  }

  /** Analyse un fichier de paie sans rien enregistrer : erreurs, CIN inconnus, écarts avec les fiches, départs, retours. */
  analyserImport(file: File, periode: string): Observable<PaieImportAnalyse> {
    return this.http.post<PaieImportAnalyse>(`${this.baseUrl}/import/analyse`, this.formulaireImport(file), {
      params: new HttpParams().set('periode', periode)
    });
  }

  /** Corrige les fiches à partir du fichier (alignements, créations) et renvoie la nouvelle analyse. */
  corrigerImport(file: File, periode: string, corrections: PaieImportCorrections): Observable<PaieImportAnalyse> {
    return this.http.post<PaieImportAnalyse>(`${this.baseUrl}/import/corrections`, this.formulaireImport(file, { corrections }), {
      params: new HttpParams().set('periode', periode)
    });
  }

  /** Importe un fichier prêt, avec les départs confirmés (chacun avec son motif). */
  importer(file: File, periode: string, departs: { employeId: number; motif: string }[]): Observable<PaieImportResult> {
    return this.http.post<PaieImportResult>(`${this.baseUrl}/import`, this.formulaireImport(file, { departs: { departs } }), {
      params: new HttpParams().set('periode', periode)
    });
  }

  /** Le fichier, et chaque partie JSON en Blob `application/json` (attendu par `@RequestPart` côté serveur). */
  private formulaireImport(file: File, parties: Record<string, unknown> = {}): FormData {
    const formData = new FormData();
    formData.append('file', file);
    for (const [nom, valeur] of Object.entries(parties)) {
      formData.append(nom, new Blob([JSON.stringify(valeur)], { type: 'application/json' }));
    }
    return formData;
  }

  telechargerModele(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/import/modele`, { responseType: 'blob' });
  }

  exporter(requete: PaieExportRequest): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/export`, requete, { responseType: 'blob' });
  }

  telechargerRapportPdf(requete: PaieRapportPdfRequest): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/report/pdf`, requete, { responseType: 'blob' });
  }

  /** Indicateurs du tableau de bord du mois de `criteres` (obligatoire) sur son périmètre filtré. */
  analyser(criteres: PaieSearchCriteria): Observable<PaieAnalytique> {
    return this.http.post<PaieAnalytique>(`${this.baseUrl}/analytique`, criteres);
  }

  /** Les mois qui contiennent de la paie sur le périmètre filtré (le mois de `criteres` est ignoré). */
  rechercherPeriodes(criteres: PaieSearchCriteria): Observable<PaiePeriodeResume[]> {
    return this.http.post<PaiePeriodeResume[]>(`${this.baseUrl}/periodes/search`, criteres);
  }

  /** Les chantiers, avec leurs équipes, du mois de `criteres` (obligatoire) sur son périmètre filtré. */
  rechercherChantiers(criteres: PaieSearchCriteria): Observable<PaieChantierPeriode[]> {
    return this.http.post<PaieChantierPeriode[]>(`${this.baseUrl}/chantiers/search`, criteres);
  }

  listerPeriodes(): Observable<PaiePeriodeResume[]> {
    return this.http.get<PaiePeriodeResume[]>(`${this.baseUrl}/periodes`);
  }

  listerTableauxMateriel(): Observable<PaieMaterielTableau[]> {
    return this.http.get<PaieMaterielTableau[]>(`${this.baseUrl}/materiel`);
  }

  listerChantiersDeLaPeriode(periode: string): Observable<PaieChantierPeriode[]> {
    const params = new HttpParams().set('periode', periode);
    return this.http.get<PaieChantierPeriode[]>(`${this.baseUrl}/chantiers`, { params });
  }
}
