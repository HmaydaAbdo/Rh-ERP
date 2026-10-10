import { ConfirmDialogService, NotificationService } from './feedback.service';

describe('NotificationService', () => {
  it('publie une notification puis la retire par identifiant', () => {
    const service = new NotificationService();

    service.add({ severity: 'success', summary: 'Enregistré', detail: 'Les changements sont enregistrés.', life: 0 });
    const id = service.notifications()[0].id;
    expect(service.notifications().length).toBe(1);
    expect(service.notifications()[0].summary).toBe('Enregistré');

    service.remove(id);
    expect(service.notifications()).toEqual([]);
  });

  it('retire automatiquement une notification après sa durée de vie', async () => {
    const service = new NotificationService();
    service.add({ severity: 'info', summary: 'Mise à jour', life: 5 });

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(service.notifications()).toEqual([]);
  });
});

describe('ConfirmDialogService', () => {
  it('publie la demande puis exécute uniquement le callback de confirmation', () => {
    const service = new ConfirmDialogService();
    const accept = jasmine.createSpy('accept');
    const reject = jasmine.createSpy('reject');

    service.confirm({ header: 'Supprimer ?', message: 'Cette action est définitive.', accept, reject });
    expect(service.request()?.header).toBe('Supprimer ?');

    service.accept();
    expect(accept).toHaveBeenCalledOnceWith();
    expect(reject).not.toHaveBeenCalled();
    expect(service.request()).toBeNull();
  });

  it('exécute le callback de refus et ferme la demande', () => {
    const service = new ConfirmDialogService();
    const reject = jasmine.createSpy('reject');
    service.confirm({ header: 'Quitter ?', message: 'Vos changements seront perdus.', reject });

    service.reject();

    expect(reject).toHaveBeenCalledOnceWith();
    expect(service.request()).toBeNull();
  });
});
