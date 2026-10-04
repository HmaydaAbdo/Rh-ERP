import { firstValueFrom, of } from 'rxjs';

import { LazySelectInMemorySource } from './lazy-select-in-memory.source';
import { LazySelectSource } from './lazy-select.model';

interface Element {
  id: number;
  code: string;
}

describe('LazySelectInMemorySource', () => {
  const elements: Element[] = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, code: `C${i + 1}0` }));
  let secours: jasmine.SpyObj<LazySelectSource<Element>>;
  let source: LazySelectInMemorySource<Element>;

  beforeEach(() => {
    secours = jasmine.createSpyObj<LazySelectSource<Element>>('secours', ['fetchPage', 'fetchById']);
    secours.fetchById.and.returnValue(of({ id: 99, code: 'AILLEURS' }));
    source = new LazySelectInMemorySource(elements, (e) => e.code, secours);
  });

  it('pagine la liste et annonce son total', async () => {
    const page = await firstValueFrom(source.fetchPage(1, 2, ''));

    expect(page.items.map((e) => e.id)).toEqual([3, 4]);
    expect(page.totalRecords).toBe(5);
  });

  it('cherche sans tenir compte de la casse ni des espaces autour, sans appeler le serveur', async () => {
    const page = await firstValueFrom(source.fetchPage(0, 10, '  c3 '));

    expect(page.items.map((e) => e.code)).toEqual(['C30']);
    expect(secours.fetchPage).not.toHaveBeenCalled();
  });

  it('résout un identifiant de la liste sans appel serveur', async () => {
    expect((await firstValueFrom(source.fetchById(2))).code).toBe('C20');
    expect((await firstValueFrom(source.fetchById('4'))).code).toBe('C40');
    expect(secours.fetchById).not.toHaveBeenCalled();
  });

  it('confie à la source de secours un identifiant absent de la liste', async () => {
    expect((await firstValueFrom(source.fetchById(99))).code).toBe('AILLEURS');
    expect(secours.fetchById).toHaveBeenCalledOnceWith(99);
  });
});
