import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

const CONTACTS = [
  { url: 'https://www.facebook.com/A3itEdxN', logoUrl: 'assets/images/logo/facebook-color.png' },
  { url: 'https://www.wantedly.com/id/cilly', logoUrl: 'assets/images/logo/wantedly-color.png' },
]

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss']
})
export class ContactComponent {
  contacts = CONTACTS
}
