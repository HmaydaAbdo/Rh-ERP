import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../shared/feedback/feedback.service';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
  });

  it('annonce une erreur d’API avec le message du serveur', () => {
    http.get('functions/1').subscribe({ error: () => undefined });

    controller.expectOne('functions/1').flush({ message: 'Fonction introuvable' }, { status: 404, statusText: 'Not Found' });

    expect(notifications.notifications()[0]).toMatchObject({ severity: 'error', detail: 'Fonction introuvable' });
  });

  it('annonce un message générique quand le serveur ne répond pas de message', () => {
    http.get('functions/1').subscribe({ error: () => undefined });

    controller.expectOne('functions/1').flush(null, { status: 500, statusText: 'Server Error' });

    expect(notifications.notifications()[0].detail).toContain('communication avec le serveur');
  });

  it('ne dit rien quand la restauration de session échoue : un visiteur sans session n’a pas d’erreur à voir', () => {
    let erreur = false;
    http.post('auth/refresh', {}).subscribe({ error: () => (erreur = true) });

    controller.expectOne('auth/refresh').flush({ message: 'Session expirée' }, { status: 401, statusText: 'Unauthorized' });

    expect(erreur).toBe(true);
    expect(notifications.notifications()).toEqual([]);
  });
});
