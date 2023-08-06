import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { MatTooltipModule } from '@angular/material/tooltip'

const TYPES = {
  item: 'item',
  division: 'division',
} as const

interface Item {
  type: (typeof TYPES)[typeof TYPES.item]
  value: string
}

interface Division {
  type: (typeof TYPES)[typeof TYPES.division]
  value: ''
}

interface Skill {
  title: string
  list: (Item | Division)[]
}

interface Skills {
  likes: Skill
  experienced: Skill
}

const SKILLS: Skills = {
  likes: {
    title: '得意・好き',
    list: [
      { type: TYPES.item, value: 'PHP' },
      { type: TYPES.item, value: 'Laravel' },
      { type: TYPES.division, value: '' },
      { type: TYPES.item, value: 'JavaScript' },
      { type: TYPES.item, value: 'TypeScript' },
      { type: TYPES.item, value: 'Angular / AngularJs' },
      { type: TYPES.item, value: 'Vue.js' },
      { type: TYPES.item, value: 'Angular Material' },
      { type: TYPES.division, value: '' },
      { type: TYPES.item, value: 'NoSQL (firestore)' },
      { type: TYPES.item, value: 'Firebase' },
      { type: TYPES.item, value: 'Terraform' },
    ],
  },
  experienced: {
    title: '経験あり',
    list: [
      { type: TYPES.item, value: 'CSS' },
      { type: TYPES.item, value: 'Tailwind' },
      { type: TYPES.item, value: 'Vuetify' },
      { type: TYPES.item, value: 'Nuxt.js' },
      { type: TYPES.division, value: '' },
      { type: TYPES.item, value: 'MySQL' },
      { type: TYPES.item, value: 'PostgreSQL' },
      { type: TYPES.item, value: 'GCP' },
      { type: TYPES.item, value: 'Docker' },
      { type: TYPES.item, value: 'Vagrant' },
    ],
  },
}

@Component({
  selector: 'app-skills',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatListModule, MatTooltipModule],
  templateUrl: './skills.component.html',
  styleUrls: ['./skills.component.scss'],
})
export class SkillsComponent {
  skills: Skills = SKILLS
}
