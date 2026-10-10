import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  afterEach(() => vi.useRealTimers());

    const racine = document.documentElement;

    beforeEach(() => {
        localStorage.removeItem('staport-theme');
        racine.removeAttribute('data-theme');
        racine.classList.remove('theme-transition');
    });

    afterEach(() => {
        localStorage.removeItem('staport-theme');
        racine.removeAttribute('data-theme');
        racine.classList.remove('theme-transition');
    });

    function creer(): ThemeService {
        TestBed.resetTestingModule();
        return TestBed.inject(ThemeService);
    }

    it('applique le thème sur <html>', () => {
        const service = creer();

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

        expect(service.theme()).toBe('dark');
        expect(racine.getAttribute('data-theme')).toBe('dark');
        expect(localStorage.getItem('staport-theme')).toBe('dark');
    });

    it('fait glisser les couleurs à la bascule, puis retire la classe de transition', () => {
        vi.useFakeTimers();
        localStorage.setItem('staport-theme', 'light');
        const service = creer();

        service.basculer();
        expect(racine.classList.contains('theme-transition')).toBe(true);

        vi.advanceTimersByTime(300);
        expect(racine.classList.contains('theme-transition')).toBe(false);
    });

    it('ne joue aucune transition au premier affichage', () => {
        creer();

        expect(racine.classList.contains('theme-transition')).toBe(false);
    });
});
