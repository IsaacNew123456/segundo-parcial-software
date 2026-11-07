import { Routes } from '@angular/router';
import { Diagram } from './diagram/diagram';
import { LandinPage } from './landin-page/landin-page';
import { ProjectsDashboard } from './projects/projects-dashboard/projects-dashboard';

export const routes: Routes = [ 
  { path: '', component: LandinPage },  
  { path: 'projects', component: ProjectsDashboard },
  { 
    path: 'diagram/:roomId', 
    component: Diagram,
  },
  { path: '**', redirectTo: '' }
];
