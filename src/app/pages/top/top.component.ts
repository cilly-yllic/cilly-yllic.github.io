import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'

import { ContactComponent } from './contact/contact.component'
import { SkillsComponent } from './skills/skills.component'
import { WorkComponent } from './work/work.component'

@Component({
  selector: 'app-top',
  standalone: true,
  imports: [CommonModule, ContactComponent, SkillsComponent, WorkComponent],
  templateUrl: './top.component.html',
  styleUrls: ['./top.component.scss'],
})
export class TopComponent {}
