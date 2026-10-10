import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

/** Prépare un service qui appelle l'API : requêtes interceptées par `HttpTestingController`, aucun réseau. */
export function preparerHttp(): HttpTestingController {
  TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
  return TestBed.inject(HttpTestingController);
}

/** La seule requête en attente sur `url` (sans les paramètres), avec sa méthode : échoue s'il y en a une autre ou aucune. */
export function requete(http: HttpTestingController, methode: string, url: string): TestRequest {
  return http.expectOne((r) => r.method === methode && r.url === url);
}
