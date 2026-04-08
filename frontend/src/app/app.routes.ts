import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/callback.component').then(m => m.CallbackComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'customers',
    loadComponent: () => import('./features/customers/customer-list.component').then(m => m.CustomerListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'customers/new',
    loadComponent: () => import('./features/onboarding/onboarding.component').then(m => m.OnboardingComponent),
    canActivate: [authGuard],
  },
  {
    path: 'customers/:id',
    loadComponent: () => import('./features/customers/customer-detail.component').then(m => m.CustomerDetailComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '/dashboard' },
];
