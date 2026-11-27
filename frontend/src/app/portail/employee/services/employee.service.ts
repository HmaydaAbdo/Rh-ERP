import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { MouvementRequete } from '../../mouvement/mouvement-filtres';

import { Page } from '../../../shared/models/page.model';
import {
  CnssImportResult,
  Civilite,
  FormatDocument,
  Employee,
  DimensionEmployes,
  EmployeeAnalytique,
  EmployeeCreateRequest,
  EmployeeImportResult,
  EmployeeRegroupement,
  EmployeeSearchCriteria,
  EmployeeUpdateRequest
} from '../models/employee.model';

export interface EmployeePageRequest {
  page: number;
  size: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'employees';

  /** Les employés du périmètre regroupés par chantier, équipe ou fonction (vue Cartes). */
  regrouper(criteria: EmployeeSearchCriteria, dimension: DimensionEmployes): Observable<EmployeeRegroupement[]> {
    return this.http.post<EmployeeRegroupement[]>(`${this.baseUrl}/regroupements`, criteria, { params: new HttpParams().set('dimension', dimension) });
  }

  /** Chiffres clés et tranches d'âge et d'ancienneté du périmètre (vue Analytique). */
  analyser(criteria: EmployeeSearchCriteria): Observable<EmployeeAnalytique> {
    return this.http.post<EmployeeAnalytique>(`${this.baseUrl}/analytique`, criteria);
  }

  search(criteria: EmployeeSearchCriteria, pageRequest: EmployeePageRequest): Observable<Page<Employee>> {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }

    return this.http.post<Page<Employee>>(`${this.baseUrl}/search`, criteria, { params });
  }

  getById(id: number): Observable<Employee> {
    return this.http.get<Employee>(`${this.baseUrl}/${id}`);
  }

  create(dto: EmployeeCreateRequest): Observable<Employee> {
    return this.http.post<Employee>(this.baseUrl, dto);
  }

  update(id: number, dto: EmployeeUpdateRequest): Observable<Employee> {
    return this.http.put<Employee>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  importer(file: File): Observable<EmployeeImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<EmployeeImportResult>(`${this.baseUrl}/import`, formData);
  }

  /** Déclarations CNSS (CIN, matricule, date de déclaration) : atomique, une ligne refusée n'écrit rien (`EMPLOYEE_IMPORT`). */
  importerCnss(file: File): Observable<CnssImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<CnssImportResult>(`${this.baseUrl}/import/cnss`, formData);
  }

  /** L'attestation de travail en PDF ou en Word ; la civilité choisie reste sur la fiche (`DOCUMENT_ADMIN_EDITER`). */
  attestationTravail(id: number, civilite: Civilite, format: FormatDocument = 'PDF'): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/${id}/attestation-travail`, { civilite, format }, { responseType: 'blob' });
  }

  telechargerModele(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/import/modele`, { responseType: 'blob' });
  }

  /** Le PDF des entrées et sorties d'un mois, regroupé par chantier, pour le périmètre filtré (`EMPLOYEE_EXPORT`). */
  exporterMouvementsPdf(requete: MouvementRequete): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/mouvements-mois/pdf`, requete, { responseType: 'blob' });
  }
}
