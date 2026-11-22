import { TestBed } from '@angular/core/testing';

import { ConfirmDialogService, NotificationService } from './feedback.service';
import { FeedbackViewportComponent } from './feedback-viewport.component';

describe('FeedbackViewportComponent', () => {
  let notifications: NotificationService;
  let confirmation: ConfirmDialogService;

  beforeEach(async () => {
    notifications = new NotificationService();
    confirmation = new ConfirmDialogService();
    await TestBed.configureTestingModule({
      imports: [FeedbackViewportComponent],
      providers: [
        { provide: NotificationService, useValue: notifications },
        { provide: ConfirmDialogService, useValue: confirmation }
      ]
    }).compileComponents();
  });

  it('annonce et permet de fermer une notification', () => {
    const fixture = TestBed.createComponent(FeedbackViewportComponent);
    notifications.add({ severity: 'error', summary: 'Erreur', detail: 'Réessayez.', life: 0 });
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(toast.textContent).toContain('Erreur');
    expect(toast.textContent).toContain('Réessayez.');
    (toast.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('pose la confirmation et les notifications dans la couche supérieure : elles passent au-dessus des fenêtres du CDK (KAN-310)', async () => {
    const fixture = TestBed.createComponent(FeedbackViewportComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const pile = fixture.nativeElement.querySelector('.feedback-stack') as HTMLElement;
    expect(pile.matches(':popover-open')).toBe(true);

    confirmation.confirm({ header: 'Fermer ?', message: 'Saisie non enregistrée.' });
    fixture.detectChanges();
    await fixture.whenStable();
    const fond = fixture.nativeElement.querySelector('.feedback-dialog-backdrop') as HTMLElement;
    expect(fond.matches(':popover-open')).toBe(true);

    confirmation.reject();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.feedback-dialog-backdrop')).toBeNull();
  });

  it('rend une confirmation modale avec focus piégé et la ferme sur Échap', () => {
    const fixture = TestBed.createComponent(FeedbackViewportComponent);
    confirmation.confirm({ header: 'Quitter ?', message: 'Vos changements seront perdus.' });
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Vos changements seront perdus.');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
