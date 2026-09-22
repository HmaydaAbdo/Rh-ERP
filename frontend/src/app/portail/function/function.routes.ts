import { Routes } from '@angular/router';

export const FUNCTION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/function-list.component').then((m) => m.FunctionListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./form/function-form.component').then((m) => m.FunctionFormComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./details/function-detail.component').then((m) => m.FunctionDetailComponent)
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./form/function-form.component').then((m) => m.FunctionFormComponent)
  }
];
