import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

import {MatSidenavModule} from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { HeaderComponent } from './header/header.component'
import { FooterComponent } from './footer/footer.component'

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, MatSidenavModule, MatIconModule, MatListModule, HeaderComponent, FooterComponent],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  router = inject(Router)
  onClick(e: MouseEvent, route: string, fragment?: string) {
    e.stopPropagation()
    return this.router.navigate([route], fragment ? { fragment } : undefined)
  }
}
