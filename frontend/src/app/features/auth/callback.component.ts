import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true,
  template: `
    <div style="height:100vh;display:flex;align-items:center;justify-content:center;
                font-family:system-ui;color:#666">
      <div style="text-align:center">
        <div style="font-size:24px;margin-bottom:8px">BankOnboard</div>
        <div>Completing sign in…</div>
      </div>
    </div>
  `,
})
export class CallbackComponent implements OnInit {
  constructor(private auth: AuthService) {}
  async ngOnInit() { await this.auth.handleCallback(); }
}
