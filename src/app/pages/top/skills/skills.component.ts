import { Component, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { MatTooltipModule } from '@angular/material/tooltip'

const FIREBASE = [
  'emulatorでのlocal開発',
  'Authentication',
  'Firestore',
  'Storage',
  'Hosting',
  'Functions',
  'Remote Config',
  'Extensions',
  'Cloud Messaging',
  'Cloud Tasks',
]

const SKILLS = [
  {
    skill: 'プログラミング言語',
    icon: {
      fontSet: '',
      value: ''
    },
    items: [
      { icon: 'php', title: 'PHP', line: { text: '4年', level: 5 }, tooltip: 'バックエンド（ブラウザゲーム・社内ツール、自社開発など）' },
      { icon: 'javascript', title: 'JavaScript', line: { text: '5年以上', level: 5 }, tooltip: '' },
      { icon: '', title: 'TypeScript', line: { text: '5年以上', level: 5 }, tooltip: '' },
      { icon: '', title: 'CSS', line: { text: '5年以上', level: 3 }, tooltip: 'UIライブラリなども併用し、開発は可能だが\nスマートな開発や構造化等は苦手。' },
    ]
  },
  {
    skill: 'フレームワーク',
    icon: {
      fontSet: '',
      value: ''
    },
    items: [
      { icon: '', title: 'Laravel', line: { text: '5年以上', level: 5 }, tooltip: '' },
      { icon: '', title: 'Angular / AngularJs', line: { text: '5年以上', level: 5 }, tooltip: '' },
      { icon: '', title: 'Vue.js', line: { text: '2-3年', level: 5 }, tooltip: 'pure jsからのリプレイス' },
      { icon: '', title: 'Nuxt.js', line: { text: '1年', level: 3 }, tooltip: '(SSR)での新規開発' },
    ]
  },
  {
    skill: 'UIライブラリ',
    icon: {
      fontSet: '',
      value: ''
    },
    items: [
      { icon: '', title: 'Material', line: { text: '5年以上', level: 5 }, tooltip: 'Angular Materialで利用' },
      { icon: '', title: 'Tailwind', line: { text: '1年', level: 3 }, tooltip: 'Nuxt.jsで利用' },
      { icon: '', title: 'bootstrap', line: { text: '2-3年', level: 5 }, tooltip: '主にAngularJsで利用' },
      { icon: '', title: 'Vuetify', line: { text: '2年', level: 3 }, tooltip: 'Vue.jsで利用' },
    ]
  },
  {
    skill: 'Database',
    icon: {
      fontSet: 'material-symbols-outlined',
      value: 'database'
    },
    items: [
      { icon: '', title: 'MySQL', line: { text: '5年前後', level: 5 }, tooltip: '' },
      { icon: '', title: 'PostgreSQL', line: { text: '2-3年', level: 5 }, tooltip: '' },
      { icon: '', title: 'NoSQL  (firestore)', line: { text: '2-3年', level: 5 }, tooltip: '' },
    ]
  },
  {
    skill: 'インフラ',
    icon: {
      fontSet: '',
      value: ''
    },
    items: [
      { icon: '', title: 'GCP', line: { text: '2年', level: 5 }, tooltip: '' },
      { icon: '', title: 'Firebase', line: { text: '2-3年', level: 5 }, tooltip: FIREBASE.join('\n') },
    ]
  },
  {
    skill: 'その他',
    icon: {
      fontSet: '',
      value: ''
    },
    items: [
      { icon: '', title: 'Docker', line: { text: '4-5年', level: 4 }, tooltip: '' },
      { icon: '', title: 'Vagrant', line: { text: '2年', level: 3 }, tooltip: '' },
    ]
  },
  {
    skill: '深い実務経験はないが、経験のある技術',
    icon: {
      fontSet: '',
      value: ''
    },
    items: [
      { icon: '', title: 'AWS', line: { text: '2年', level: 5 }, tooltip: 'すでにある環境でのちょっとした修正レベル' },
      { icon: '', title: 'Rails', line: { text: '1年未満', level: 5 }, tooltip: '趣味レベル' },
      { icon: '', title: 'Python', line: { text: '1年未満', level: 5 }, tooltip: '趣味レベルでOpenCVとTesseractを使って画像解析処理の実装' },
      { icon: '', title: 'React', line: { text: '1年未満', level: 5 }, tooltip: '現在プライベートで開発中' },
      { icon: '', title: 'Flutter', line: { text: '1年未満', level: 5 }, tooltip: '環境構築や軽微な修正、Firebaseとの繋ぎ込みやemulatorなどの機能実装）' },
    ]
  }
]

@Pipe({
  name: 'level',
  standalone: true,
})
export class LevelPipe implements PipeTransform {
  transform(level: number): string {
    return `${'★'.repeat(level)}${'☆'.repeat(5 - level)}`
  }
}

@Component({
  selector: 'app-skills',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatListModule, MatTooltipModule, LevelPipe],
  templateUrl: './skills.component.html',
  styleUrls: ['./skills.component.scss']
})
export class SkillsComponent {
  skills = SKILLS
}
