import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatGridListModule } from '@angular/material/grid-list'

const WORKS = [
  { url: 'https://mooodone.com', imageUrl: 'assets/images/ogp/mooodone/main.png', thumbnailUrl: 'assets/images/ogp/mooodone/main.png', userIconUrl: '', description: '代表を勤めている合同会社です。（まだ独りです）' },
  { url: 'https://github.com/cilly-yllic', imageUrl: 'assets/images/ogp/github/main.png', thumbnailUrl: 'assets/images/ogp/github/icon.png', userIconUrl: 'assets/images/ogp/github/user-icon.jpeg', description: '今は更新していませんが、正社員時代に少し投稿していました。' },
  { url: 'https://www.npmjs.com/~cilly', imageUrl: 'assets/images/ogp/npm/main.png', thumbnailUrl: 'assets/images/ogp/npm/icon.png', userIconUrl: 'assets/images/ogp/npm/user-icon.jpeg', description: '今は更新していませんが、正社員時代に少し投稿していました。' },
  { url: 'https://qiita.com/cilly', imageUrl: 'assets/images/ogp/qiita/main.png', thumbnailUrl: 'assets/images/ogp/qiita/icon.png', userIconUrl: 'assets/images/ogp/qiita/user-icon.jpg', description: '今は更新していませんが、正社員時代に少し投稿していました。' },
]

@Component({
  selector: 'app-work',
  standalone: true,
  imports: [CommonModule, MatGridListModule],
  templateUrl: './work.component.html',
  styleUrls: ['./work.component.scss']
})
export class WorkComponent {
  works = WORKS
}
