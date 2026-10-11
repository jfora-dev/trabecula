import { Routes } from '@angular/router';
import { CaseList } from './features/case-list/case-list';

export const routes: Routes = [
  { path: '', component: CaseList, title: 'Cases | Trabecula' },
  {
    path: 'cases/:id',
    // three.js is only needed here, so it stays out of the first download.
    loadComponent: () => import('./features/case-viewer/case-viewer').then((m) => m.CaseViewer),
    title: 'Case review | Trabecula',
  },
  { path: '**', redirectTo: '' },
];
