import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const racine = document.documentElement;

  beforeEach(() => {
    localStorage.removeItem('staport-theme');
    racine.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.removeItem('staport-theme');
    racine.removeAttribute('data-theme');
  });

  function creer(): ThemeService {
    TestBed.resetTestingModule();
    return TestBed.inject(ThemeService);
  }

  it('applique le thème sur <html>', () => {
    const service = creer();
    TestBed.flushEffects();

    expect(racine.getAttribute('data-theme')).toBe(service.theme());
  });

  it('reprend le choix mémorisé plutôt que la préférence du système', () => {
    localStorage.setItem('staport-theme', 'dark');

    expect(creer().theme()).toBe('dark');
  });

  it('ignore une valeur mémorisée invalide', () => {
    localStorage.setItem('staport-theme', 'violet');

    expect(['light', 'dark']).toContain(creer().theme());
  });

  it('bascule, applique et mémorise le choix', () => {
    localStorage.setItem('staport-theme', 'light');
    const service = creer();

    service.basculer();
    TestBed.flushEffects();

    expect(service.theme()).toBe('dark');
    expect(racine.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('staport-theme')).toBe('dark');
  });
});
