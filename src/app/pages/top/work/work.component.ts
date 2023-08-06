import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { MatGridListModule } from '@angular/material/grid-list'
import { SafeHtml } from '@angular/platform-browser'

const TYPES = {
  url: 'url',
  html: 'html',
} as const
interface UrlText {
  type: (typeof TYPES)[typeof TYPES.url]
  value: string
}

interface HtmlText {
  type: (typeof TYPES)[typeof TYPES.html]
  value: SafeHtml | string
}

interface WorkItem {
  href: string
  backgroundImageUrl: string
  text: (UrlText | HtmlText)[]
}

interface Work {
  title: string
  items: WorkItem[]
}

const WORKS: Work[] = [
  {
    title: '',
    items: [
      {
        href: 'https://mooodone.com/',
        backgroundImageUrl: 'assets/images/ogp/mooodone/main.png',
        text: [
          { type: TYPES.url, value: 'https://mooodone.com/' },
          { type: TYPES.html, value: '代表を勤めている合同会社です。<br>（まだ独りです）' },
        ],
      },
    ],
  },
  {
    title: 'OSS',
    items: [
      {
        href: 'https://github.com/cilly-yllic',
        backgroundImageUrl: 'assets/images/ogp/github/icon.png',
        text: [{ type: TYPES.url, value: 'https://github.com/cilly-yllic' }],
      },
      {
        href: 'https://www.npmjs.com/~cilly',
        backgroundImageUrl: 'assets/images/ogp/npm/icon.png',
        text: [
          { type: TYPES.url, value: 'https://www.npmjs.com/~cilly' },
          { type: TYPES.html, value: '自動化や効率化できそうなアイディアを公開しています。' },
        ],
      },
    ],
  },
  {
    title: 'NOTE',
    items: [
      {
        href: 'https://qiita.com/cilly',
        backgroundImageUrl: 'assets/images/ogp/qiita/icon.png',
        text: [
          { type: TYPES.url, value: 'https://qiita.com/cilly' },
          { type: TYPES.html, value: '正社員時代に少し投稿していました。' },
        ],
      },
    ],
  },
]

@Component({
  selector: 'app-work',
  standalone: true,
  imports: [CommonModule, MatGridListModule],
  templateUrl: './work.component.html',
  styleUrls: ['./work.component.scss'],
})
export class WorkComponent {
  works = WORKS
}
