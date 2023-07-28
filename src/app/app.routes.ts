import { Routes } from '@angular/router'

// import { OthersComponent } from './pages/others/others.component'
import { TopComponent } from './pages/top/top.component'

export const routes: Routes = [
  { path: '', component: TopComponent },
  { path: '**', redirectTo: '' },
]
