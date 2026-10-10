import { TestBed } from '@angular/core/testing';

import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  it('dessine l’icône enregistrée sous son nom, masquée aux technologies d’assistance', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'download');
    fixture.detectChanges();

    const hote = fixture.nativeElement as HTMLElement;
    expect(hote.getAttribute('aria-hidden')).toBe('true');
    expect(hote.querySelector('svg')?.childElementCount).toBeGreaterThan(0);
  });

  it('suit le texte par sa taille, sauf demande contraire', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'check');
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('1.125em');

    fixture.componentRef.setInput('size', '2rem');
    fixture.detectChanges();
    expect(svg.getAttribute('width')).toBe('2rem');
  });

  it('change d’icône avec son nom', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'check');
    fixture.detectChanges();
    const avant = fixture.nativeElement.querySelector('svg').innerHTML;

    fixture.componentRef.setInput('name', 'x');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('svg').innerHTML).not.toBe(avant);
  });
});
