import { Component } from '@angular/core';
import { ChecklistComponent } from './checklist/checklist';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ChecklistComponent],
  template: `<app-checklist></app-checklist>`,
})
export class AppComponent {}