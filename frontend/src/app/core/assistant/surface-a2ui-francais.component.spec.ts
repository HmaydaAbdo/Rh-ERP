import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';

import { SurfaceA2uiFrancaisComponent, operations } from './surface-a2ui-francais.component';

describe('rendu A2UI en français (KAN-96)', () => {
  let fixture: ComponentFixture<SurfaceA2uiFrancaisComponent>;
  let ref: ComponentRef<SurfaceA2uiFrancaisComponent>;

  const afficher = async (contenu: unknown): Promise<string> => {
    ref.setInput('content', contenu);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  };

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(SurfaceA2uiFrancaisComponent);
    ref = fixture.componentRef;
    ref.setInput('activityType', 'a2ui-surface');
    ref.setInput('message', { id: 'm', role: 'activity', activityType: 'a2ui-surface', content: {} });
  });

  afterEach(() => vi.useRealTimers());

  it('annonce la construction en français, sans message anglais', async () => {
    const texte = await afficher({ status: 'building' });

    expect(texte).toContain("Construction de l'affichage");
    expect(texte).not.toMatch(/Building|Retrying|Couldn't/);
  });

  it("n'annonce une reprise qu'après le délai, puis dit l'essai en cours", async () => {
    const contenu = { status: 'retrying', attempt: 1, maxAttempts: 3 };

    expect(await afficher(contenu)).toContain("Construction de l'affichage");
    await vi.advanceTimersByTimeAsync(2100);
    fixture.detectChanges();

    expect(((fixture.nativeElement as HTMLElement).textContent ?? '')).toContain('Nouvelle tentative… (essai 1 sur 3)');
  });

  it("annonce tout de suite la reprise dès le deuxième essai", async () => {
    expect(await afficher({ status: 'retrying', attempt: 2, maxAttempts: 3 })).toContain('essai 2 sur 3');
  });

  it("dit l'échec en français et ne montre aucun détail technique", async () => {
    const texte = await afficher({ status: 'failed', error: 'a2ui_recovery_exhausted', errors: [{ code: 'x', message: 'secret technique' }] });

    expect(texte).toContain('Impossible de générer cet affichage');
    expect(texte).not.toContain('secret technique');
    expect(texte).not.toContain('a2ui_recovery_exhausted');
  });

  it('reconnaît une surface à ses opérations', () => {
    expect(operations({ a2ui_operations: [{ createSurface: {} }] })).toHaveLength(1);
    expect(operations({ operations: [{ updateComponents: {} }, 3] })).toHaveLength(1);
    expect(operations({ status: 'building' })).toEqual([]);
    expect(operations(null)).toEqual([]);
  });
});
