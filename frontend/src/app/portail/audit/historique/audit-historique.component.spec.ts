import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { AuditVersion } from '../models/audit.model';
import { AuditService } from '../services/audit.service';
import { AuditHistoriqueComponent } from './audit-historique.component';

function version(revision: number, operation: AuditVersion['operation']): AuditVersion {
  return {
    revision,
    horodatage: '2026-10-04T20:00:00Z',
    utilisateurId: 1,
    utilisateurNom: 'alice',
    origine: 'API',
    requestId: null,
    operation,
    champs: [{ champ: 'salaireTotal', avant: '1', apres: '2', ajoutes: null, retires: null }]
  };
}

function page(content: AuditVersion[], total: number, numero: number): Page<AuditVersion> {
  return { content, page: { totalElements: total, totalPages: 2, number: numero, size: 10 } };
}

describe('AuditHistoriqueComponent', () => {
  let service: jasmine.SpyObj<AuditService>;
  let fixture: ComponentFixture<AuditHistoriqueComponent>;

  beforeEach(() => {
    service = jasmine.createSpyObj<AuditService>('AuditService', ['historique']);
    TestBed.configureTestingModule({
      imports: [AuditHistoriqueComponent],
      providers: [{ provide: AuditService, useValue: service }]
    });
    fixture = TestBed.createComponent(AuditHistoriqueComponent);
    fixture.componentRef.setInput('entite', 'Paie');
    fixture.componentRef.setInput('id', 42);
  });

  it('charge les versions de l’enregistrement et les affiche de la plus récente à la plus ancienne', () => {
    service.historique.and.returnValue(of(page([version(9, 'MODIFICATION'), version(3, 'AJOUT')], 2, 0)));

    fixture.detectChanges();

    expect(service.historique).toHaveBeenCalledOnceWith('Paie', 42, { page: 0, size: 10 });
    const entetes = Array.from(fixture.nativeElement.querySelectorAll('.audit-historique__entete strong')).map((e) => (e as HTMLElement).textContent);
    expect(entetes).toEqual(['Modification', 'Ajout']);
    expect(fixture.nativeElement.textContent).toContain('par alice');
  });

  it('propose les versions plus anciennes tant qu’il en reste, et les ajoute à la suite', () => {
    service.historique.and.returnValues(of(page([version(9, 'MODIFICATION')], 2, 0)), of(page([version(3, 'AJOUT')], 2, 1)));
    fixture.detectChanges();
    expect(fixture.componentInstance['resteAcharger']()).toBeTrue();

    fixture.componentInstance['plus']();
    fixture.detectChanges();

    expect(service.historique.calls.mostRecent().args[2]).toEqual({ page: 1, size: 10 });
    expect(fixture.componentInstance['versions']().length).toBe(2);
    expect(fixture.componentInstance['resteAcharger']()).toBeFalse();
  });

  it('dit qu’aucune version n’est enregistrée quand l’historique est vide', () => {
    service.historique.and.returnValue(of(page([], 0, 0)));

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Aucune version enregistrée');
  });
});
