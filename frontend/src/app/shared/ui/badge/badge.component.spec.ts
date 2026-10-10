import { TestBed } from '@angular/core/testing';

import { BadgeComponent } from './badge.component';

describe('BadgeComponent', () => {
  it('affiche sa valeur avec la sévérité neutre par défaut', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.componentRef.setInput('value', 'Actif');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('Actif');
    expect(fixture.nativeElement.className).toContain('stp-badge--neutral');
  });

  it('porte la classe de chaque sévérité', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    for (const severite of ['success', 'warning', 'danger', 'info', 'neutral'] as const) {
      fixture.componentRef.setInput('severity', severite);
      fixture.detectChanges();
      expect(fixture.nativeElement.className).toContain(`stp-badge--${severite}`);
    }
  });
});
