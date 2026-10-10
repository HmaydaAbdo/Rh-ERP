import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { PaieService } from './paie.service';

const PAGE_VIDE = { content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } };

describe('PaieService', () => {
  let http: HttpTestingController;
  let service: PaieService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(PaieService);
  });

  afterEach(() => http.verify());

  it('recherche les bulletins par POST, critères dans le corps, page et tri dans l’URL', () => {
    service.search({ periode: '2026-08', cin: 'AB1' }, { page: 3, size: 25, sort: 'salaireTotal,desc' }).subscribe();

    const r = requete(http, 'POST', 'paie/search');
    r.flush(PAGE_VIDE);

    expect(r.request.body).toEqual({ periode: '2026-08', cin: 'AB1' });
    expect(r.request.params.toString()).toBe('page=3&size=25&sort=salaireTotal,desc');
  });

  it('lit, modifie et supprime un bulletin', () => {
    service.getById(8).subscribe();
    requete(http, 'GET', 'paie/8').flush({ id: 8 });

    service.update(8, { fonctionId: 1, chantierId: 2, equipeId: null, nombreJoursTravailles: 26, joursRecuperationOuvrable: null, joursRecuperationDimanche: null, salaireMensuel: 4000, primeRoulageOrdinaire: null, primeRoulageDimanche: null, salaireTotal: 4000, observation: null }).subscribe();
    const modification = requete(http, 'PUT', 'paie/8');
    modification.flush({ id: 8 });
    expect(modification.request.body).toMatchObject({ salaireTotal: 4000 });

    service.delete(8).subscribe();
    requete(http, 'DELETE', 'paie/8').flush(null);
  });

  it('crée un bulletin avec son employé et sa période', () => {
    service.create({ employeeId: 3, periode: '2026-08', fonctionId: 1, chantierId: 2, equipeId: null, nombreJoursTravailles: 26, joursRecuperationOuvrable: null, joursRecuperationDimanche: null, salaireMensuel: 4000, primeRoulageOrdinaire: null, primeRoulageDimanche: null, salaireTotal: 4000, observation: null }).subscribe();

    const r = requete(http, 'POST', 'paie');
    r.flush({ id: 9 });
    expect(r.request.body).toMatchObject({ employeeId: 3, periode: '2026-08' });
  });

  it('supprime un groupe de bulletins en envoyant le nombre attendu à confirmer', () => {
    let resultat: unknown;

    service.supprimerGroupe({ criteres: { periode: '2026-08', chantierIds: [3] }, nombreAttendu: 148 }).subscribe((r) => (resultat = r));

    const r = requete(http, 'POST', 'paie/suppression');
    r.flush({ supprimes: 148 });
    expect(r.request.body).toEqual({ criteres: { periode: '2026-08', chantierIds: [3] }, nombreAttendu: 148 });
    expect(resultat).toEqual({ supprimes: 148 });
  });

  it('importe un fichier Excel pour un mois : fichier en multipart, période dans l’URL', () => {
    const fichier = new File(['x'], 'paie.xlsx');

    service.importer(fichier, '2026-08').subscribe();

    const r = requete(http, 'POST', 'paie/import');
    r.flush({ totalLignes: 1, crees: 1, fonctionsCreees: [], lignesIgnorees: [] });
    expect((r.request.body as FormData).get('file')).toBe(fichier);
    expect(r.request.params.get('periode')).toBe('2026-08');
  });

  it('télécharge le modèle d’import, l’export Excel et le rapport PDF en binaire', () => {
    service.telechargerModele().subscribe();
    const modele = requete(http, 'GET', 'paie/import/modele');
    expect(modele.request.responseType).toBe('blob');
    modele.flush(new Blob());

    service.exporter({ periode: '2026-08', feuillesEquipeMode: 'AUCUNE', equipesParChantier: null, equipesExcluesFeuilleChantier: null, chantiers: null, materiel: null }).subscribe();
    const export_ = requete(http, 'POST', 'paie/export');
    expect(export_.request.responseType).toBe('blob');
    expect(export_.request.body).toMatchObject({ periode: '2026-08' });
    export_.flush(new Blob());

    service.telechargerRapportPdf({ periode: '2026-08', chantierId: 3, sansVueEnsemble: true } as never).subscribe();
    const pdf = requete(http, 'POST', 'paie/report/pdf');
    expect(pdf.request.responseType).toBe('blob');
    expect(pdf.request.body).toMatchObject({ chantierId: 3, sansVueEnsemble: true });
    pdf.flush(new Blob());
  });

  it('interroge l’analytique, les mois et les chantiers d’un périmètre filtré', () => {
    service.analyser({ periode: '2026-08' }).subscribe();
    requete(http, 'POST', 'paie/analytique').flush({});

    service.rechercherPeriodes({ cin: 'AB1' }).subscribe();
    const periodes = requete(http, 'POST', 'paie/periodes/search');
    periodes.flush([]);
    expect(periodes.request.body).toEqual({ cin: 'AB1' });

    service.rechercherChantiers({ periode: '2026-08' }).subscribe();
    requete(http, 'POST', 'paie/chantiers/search').flush([]);
  });

  it('liste les mois, le parc matériel et les chantiers d’une période', () => {
    service.listerPeriodes().subscribe();
    requete(http, 'GET', 'paie/periodes').flush([]);

    service.listerTableauxMateriel().subscribe();
    requete(http, 'GET', 'paie/materiel').flush([]);

    service.listerChantiersDeLaPeriode('2026-08').subscribe();
    const chantiers = requete(http, 'GET', 'paie/chantiers');
    chantiers.flush([]);
    expect(chantiers.request.params.get('periode')).toBe('2026-08');
  });
});
