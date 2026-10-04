import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface Task {
  section: string;
  name: string;
  completed: boolean;
  parent?: string; // name of the top-level task this item is nested under (same section)
  checks?: TaskCheck[]; // optional sub-checks; the task is complete when all are checked
  editing?: boolean; // for inline editing
  editingOriginalName?: string; // name before inline edit started (not persisted)
}

export interface TaskCheck {
  label: string;
  completed: boolean;
}

const BACKROOM_SECTION = 'Backroom/Daily Counts';

export interface TaskHistory {
  date: string;
  tasks: Task[];
  completionPercentage: number;
}

export interface HistorySummary {
  date: string;
  completionPercentage: number;
  taskCount: number;
  completedCount: number;
}

@Component({
  selector: 'app-checklist',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './checklist.html',
  styleUrls: ['./checklist.css']
})
export class ChecklistComponent implements OnInit, OnDestroy {
  currentDate: string = '';
  dateKey: string = '';  // ISO format (YYYY-MM-DD) for consistent cross-device sync
  searchDate: string = '';
  tasks: Task[] = [];
  selectedTask: Task | null = null;
  historyTasks: Task[] = [];
  historyCompletion: number = 0;
  showHistory: boolean = false;
  historyList: HistorySummary[] = [];
  historyLoading: boolean = false;
  selectedHistoryDate: string = '';

  newTaskName: string = '';
  newTaskSection: string = '';

  // Cloud sync state
  syncStatus: 'synced' | 'syncing' | 'offline' | 'error' = 'synced';
  cloudVersion: number = 0;
  isRefreshing: boolean = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private isSaving: boolean = false;
  private boundVisibilityHandler = this.onVisibilityChange.bind(this);
  private boundFocusHandler = this.onWindowFocus.bind(this);

  // Pacific time zone for consistent day boundaries
  private static readonly PACIFIC_TZ = 'America/Los_Angeles';

  /** Returns the current date key (YYYY-MM-DD) in Pacific time */
  private getPacificDateKey(): string {
    const now = new Date();
    // Format in Pacific time to get the correct calendar date
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ChecklistComponent.PACIFIC_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now); // en-CA gives YYYY-MM-DD format
    return parts;
  }

  /** Returns a user-friendly display date in Pacific time */
  private getPacificDisplayDate(): string {
    const now = new Date();
    return new Intl.DateTimeFormat('en-US', {
      timeZone: ChecklistComponent.PACIFIC_TZ,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(now);
  }

  get currentCompletionPercentage(): number {
    if (this.tasks.length === 0) return 0;
    return Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
  }

  get completedTasksTotal(): number {
    return this.tasks.filter(t => t.completed).length;
  }

  private getDefaultTasks(): Task[] {
    const t = (section: string, name: string, extra: Partial<Task> = {}): Task =>
      ({ section, name, completed: false, ...extra });
    const counts = (name: string): Task =>
      t(BACKROOM_SECTION, name, { checks: [{ label: 'Backroom', completed: false }, { label: 'Daily Counts', completed: false }] });
    const timed = (labels: string[]) => labels.map(label => ({ label, completed: false }));

    return [
    t('Store Leader Walk', 'Grocery Store Leader'),
    t('Store Leader Walk', 'Drug/Gm Store Leader'),
    t('Store Leader Walk', 'Pick Up Store Leader'),
    t('Store Leader Walk', 'Produce/Floral Store Leader'),
    t('Store Leader Walk', 'Deli Store Leader'),
    t('Store Leader Walk', 'Bakery Store Leader'),
    t('Store Leader Walk', 'Meat and Seafood Store Leader'),
    t('Store Leader Walk', 'Front End Store Leader'),
    t('Store Leader Walk', 'Pharmacy Store Leader'),
    t('Store Leader Walk', 'Home Store Leader'),
    t('Store Leader Walk', 'Apparel Store Leader'),
    t('Dept Leader', 'Grocery Dept Leader'),
    t('Dept Leader', 'Drug/Gm Dept Leader'),
    t('Dept Leader', 'Pick Up Dept Leader'),
    t('Dept Leader', 'Produce/Floral Dept Leader'),
    t('Dept Leader', 'Deli Dept Leader'),
    t('Dept Leader', 'Starbucks Dept Leader'),
    t('Dept Leader', 'Bakery Dept Leader'),
    t('Dept Leader', 'Meat and Seafood Dept Leader'),
    t('Dept Leader', 'Front End Dept Leader'),
    t('Dept Leader', 'Pharmacy Dept Leader'),
    t('Dept Leader', 'Home Dept Leader'),
    t('Dept Leader', 'Apparel Dept Leader'),
    t('Closing MOD Duties', 'Getting a Good Close GSC'),
    t('Closing MOD Duties', 'Trash'),
    t('Equipment Inspections', 'Balers'),
    t('Equipment Inspections', 'Battery PIT (AM)'),
    t('Equipment Inspections', 'Battery PIT (PM)'),
    t('Equipment Inspections', 'Propane PIT (AM)'),
    t('Equipment Inspections', 'Propane PIT (PM)'),
    t('Equipment Inspections', 'Oven'),
    t('Equipment Inspections', 'Slicers'),
    t('Equipment Inspections', 'Meat Saw'),
    t('Equipment Inspections', 'Grinder'),
    t('Fresh Production', 'Bakery'),
    t('Fresh Production', 'Prep for Today', { parent: 'Bakery' }),
    t('Fresh Production', 'Prep for Tomorrow', { parent: 'Bakery' }),
    t('Fresh Production', 'Thaw and Sell', { parent: 'Bakery' }),
    t('Fresh Production', 'Cookies', { parent: 'Bakery' }),
    t('Fresh Production', 'Deli'),
    t('Fresh Production', 'FSGNG', { parent: 'Deli' }),
    t('Fresh Production', 'Hot Production', { parent: 'Deli', checks: timed(['12pm', '2pm', '4pm', '6pm']) }),
    t('Fresh Production', 'Cold Production', { parent: 'Deli' }),
    t('Fresh Production', 'Thaw and Sell', { parent: 'Deli' }),
    t('Fresh Production', 'Meat'),
    t('Fresh Production', 'Production', { parent: 'Meat' }),
    t('Fresh Production', 'Meat Thaw and Sell', { parent: 'Meat' }),
    t('Fresh Production', 'Seafood Thaw and Sell', { parent: 'Meat', checks: timed(['12pm', '4pm']) }),
    t('Fresh Production', 'Starbucks'),
    t('Fresh Production', 'Murrays'),
    t('Replenishment', 'HABA'),
    t('Replenishment', 'Produce'),
    counts('Produce'),
    t(BACKROOM_SECTION, 'Produce Bulk', { parent: 'Produce' }),
    counts('Deli'),
    t(BACKROOM_SECTION, 'Deli Bulk', { parent: 'Deli' }),
    counts('Bakery'),
    counts("Murray's"),
    counts('Meat'),
    counts('Seafood'),
    t(BACKROOM_SECTION, 'Seafood Bulk', { parent: 'Seafood' }),
    counts('Grocery'),
    counts('HBC'),
    counts('Comm Bakery'),
    counts('Dairy'),
    counts('Liquor'),
    counts('Packaged Meat'),
    counts('Pharmacy'),
    counts('Tobacco'),
    ];
  }

  /**
   * Inserts default tasks that are missing from a saved checklist (e.g. items added
   * to the defaults after today's list was created). Only applies to sections the
   * saved list already has, so sections removed by the user stay removed.
   */
  private mergeMissingDefaults(tasks: Task[]): Task[] {
    const merged = [...tasks];
    const key = (t: Task) => `${t.section}|${t.parent ?? ''}|${t.name}`;
    const existing = new Set(merged.map(key));
    let added = false;

    for (const def of this.getDefaultTasks()) {
      if (existing.has(key(def)) || !merged.some(t => t.section === def.section)) continue;
      if (def.parent && !merged.some(t => t.section === def.section && !t.parent && t.name === def.parent)) continue;

      // Insert after the last task in the same group (parent + its children), else end of section
      let idx = -1;
      merged.forEach((t, i) => {
        if (t.section !== def.section) return;
        if (!def.parent || (!t.parent && t.name === def.parent) || t.parent === def.parent) idx = i;
      });
      merged.splice(idx + 1, 0, { ...def, checks: def.checks?.map(c => ({ ...c })) });
      existing.add(key(def));
      added = true;
    }
    return added ? merged : tasks;
  }

  constructor(private cdr: ChangeDetectorRef) {
    this.tasks = this.getDefaultTasks();
  }

  ngOnInit(): void {
    this.currentDate = this.getPacificDisplayDate();
    this.dateKey = this.getPacificDateKey();
    this.loadFromCloud();
    this.startPolling();

    // Listen for visibility and focus changes to sync across devices
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    window.addEventListener('focus', this.boundFocusHandler);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    window.removeEventListener('focus', this.boundFocusHandler);
  }

  private onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.refreshData();
    }
  }

  private onWindowFocus(): void {
    this.refreshData();
  }

  // ------------------- Cloud Sync -------------------
  private getDateKey(): string {
    return this.dateKey;
  }

  async loadFromCloud(): Promise<void> {
    this.syncStatus = 'syncing';
    try {
      const res = await fetch(`/api/checklist/${this.getDateKey()}`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      if (data.exists && data.tasks && data.tasks.length > 0) {
        this.tasks = this.mergeMissingDefaults(data.tasks);
        this.cloudVersion = data.version;
        if (this.tasks !== data.tasks) {
          // New default items were added — push them so other devices see them
          await this.saveToCloud();
        }
      } else {
        // No cloud data yet — use defaults (or localStorage as migration)
        const localKey = `checklist-${this.dateKey}`;
        const saved = localStorage.getItem(localKey);
        if (saved) {
          this.tasks = JSON.parse(saved);
        }
        // Push initial state to cloud
        await this.saveToCloud();
      }
      this.syncStatus = 'synced';
    } catch (err) {
      console.error('Cloud load failed, falling back to local:', err);
      this.syncStatus = 'offline';
      this.loadTodayTasksLocal();
    } finally {
      this.cdr.markForCheck();
    }
  }

  private async saveToCloud(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    this.syncStatus = 'syncing';

    try {
      const payload = {
        date: this.dateKey,
        tasks: this.tasks.map(t => ({
          section: t.section,
          name: t.name,
          completed: t.completed,
          ...(t.parent ? { parent: t.parent } : {}),
          ...(t.checks ? { checks: t.checks.map(c => ({ label: c.label, completed: c.completed })) } : {}),
        })),
      };

      const res = await fetch(`/api/checklist/${this.getDateKey()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save');

      const data = await res.json();
      this.cloudVersion = data.version;
      this.syncStatus = 'synced';

      // Also save to localStorage as backup
      this.saveTasksToLocal();
    } catch (err) {
      console.error('Cloud save failed:', err);
      this.syncStatus = 'error';
      this.saveTasksToLocal();
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  private debouncedSaveToCloud(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveToCloud();
      this.saveCompletionPercentage();
    }, 500);
  }

  private async pollForChanges(): Promise<void> {
    if (this.isSaving) return;

    // Check if the day has changed in Pacific time (midnight PST/PDT rollover)
    const currentPacificDate = this.getPacificDateKey();
    if (currentPacificDate !== this.dateKey) {
      await this.handleNewDay(currentPacificDate);
      return;
    }

    try {
      const res = await fetch(`/api/checklist/${this.getDateKey()}`);
      if (!res.ok) return;

      const data = await res.json();
      if (data.exists && data.version > this.cloudVersion) {
        // Newer version available — update local state
        this.cloudVersion = data.version;
        this.tasks = data.tasks;
        this.saveTasksToLocal();
        this.syncStatus = 'synced';
        this.cdr.markForCheck();
      }
    } catch {
      // Silent fail on poll — will retry next interval
    }
  }

  /** Handle the transition to a new day at midnight Pacific time */
  private async handleNewDay(newDateKey: string): Promise<void> {
    // Save history for the previous day before resetting
    try {
      const completion = Math.round(
        (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
      );
      const record: TaskHistory = {
        date: this.dateKey,
        tasks: JSON.parse(JSON.stringify(this.tasks)),
        completionPercentage: completion,
      };
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch (err) {
      console.error('Failed to auto-save history on day change:', err);
    }

    // Switch to the new day
    this.dateKey = newDateKey;
    this.currentDate = this.getPacificDisplayDate();
    this.cloudVersion = 0;
    this.tasks = this.getDefaultTasks();

    // Load new day's data from cloud (in case another device already created it)
    await this.loadFromCloud();
    this.cdr.markForCheck();
  }

  /** Full refresh of today's tasks from cloud — called by refresh button and visibility events */
  async refreshData(): Promise<void> {
    if (this.isSaving) return;

    // Check if the day has changed in Pacific time
    const currentPacificDate = this.getPacificDateKey();
    if (currentPacificDate !== this.dateKey) {
      await this.handleNewDay(currentPacificDate);
      return;
    }

    this.isRefreshing = true;
    this.syncStatus = 'syncing';

    try {
      const res = await fetch(`/api/checklist/${this.getDateKey()}`);
      if (!res.ok) throw new Error('Failed to refresh');

      const data = await res.json();
      if (data.exists && data.tasks && data.tasks.length > 0) {
        this.cloudVersion = data.version;
        this.tasks = data.tasks;
        this.saveTasksToLocal();
      }
      this.syncStatus = 'synced';
    } catch (err) {
      console.error('Refresh failed:', err);
      this.syncStatus = 'error';
    } finally {
      this.isRefreshing = false;
      this.cdr.markForCheck();
    }

    // Also refresh history list if the panel is open
    if (this.showHistory) {
      this.fetchHistoryList();
    }
  }

  private startPolling(): void {
    // Poll every 3 seconds for changes from other users
    this.pollInterval = setInterval(() => {
      this.pollForChanges();
    }, 3000);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // ------------------- Task Management -------------------
  toggleTask(task: Task) {
    this.setTaskCompleted(task, !task.completed);
    // Checking/unchecking a parent applies to all of its nested items
    for (const child of this.getChildTasks(task)) {
      this.setTaskCompleted(child, task.completed);
    }
    this.updateParentCompletion(task);
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  toggleCheck(task: Task, check: TaskCheck) {
    check.completed = !check.completed;
    task.completed = task.checks!.every(c => c.completed) && this.getChildTasks(task).every(c => c.completed);
    this.updateParentCompletion(task);
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  private setTaskCompleted(task: Task, completed: boolean) {
    task.completed = completed;
    task.checks?.forEach(c => (c.completed = completed));
  }

  /** A parent is complete once all of its nested items are complete */
  private updateParentCompletion(task: Task) {
    if (!task.parent) return;
    const parent = this.tasks.find(t => t.section === task.section && !t.parent && t.name === task.parent);
    if (!parent) return;
    const children = this.getChildTasks(parent);
    parent.completed = children.every(c => c.completed) && (parent.checks ?? []).every(c => c.completed);
  }

  saveCompletionPercentage() {
    const completion = Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
    const record: TaskHistory = {
      date: this.dateKey,
      tasks: JSON.parse(JSON.stringify(this.tasks)),
      completionPercentage: completion
    };
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }).catch(err => console.error('Failed to save completion percentage:', err));
  }

  selectTask(task: Task) {
    this.selectedTask = task;
  }

  completedTasksCount(section: string): number {
    return this.getTasksBySection(section).filter(t => t.completed).length;
  }

  totalTasksCount(section: string): number {
    return this.getTasksBySection(section).length;
  }

  getTasksBySection(section: string): Task[] {
    return this.tasks.filter(t => t.section === section);
  }

  /** Top-level tasks in a section (nested items are rendered under their parent) */
  getRootTasks(section: string): Task[] {
    return this.tasks.filter(t => t.section === section && !t.parent);
  }

  getChildTasks(task: Task): Task[] {
    if (task.parent) return [];
    return this.tasks.filter(t => t.section === task.section && t.parent === task.name);
  }

  sections(): string[] {
    return [...new Set(this.tasks.map(t => t.section))];
  }

  // ------------------- Add / Edit / Delete -------------------
  addTask() {
    if (!this.newTaskName.trim() || !this.newTaskSection.trim()) return;
    this.tasks.push({
      section: this.newTaskSection.trim(),
      name: this.newTaskName.trim(),
      completed: false
    });
    this.newTaskName = '';
    this.newTaskSection = '';
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  startEditing(task: Task) {
    task.editingOriginalName = task.name;
    task.editing = true;
  }

  saveEdit(task: Task, newName: string) {
    if (!newName.trim()) return;
    // Keep nested items attached when a parent is renamed
    if (!task.parent && task.editingOriginalName && task.editingOriginalName !== newName.trim()) {
      this.tasks
        .filter(t => t.section === task.section && t.parent === task.editingOriginalName)
        .forEach(t => (t.parent = newName.trim()));
    }
    delete task.editingOriginalName;
    task.name = newName.trim();
    task.editing = false;
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  cancelEdit(task: Task) {
    if (task.editingOriginalName !== undefined) task.name = task.editingOriginalName;
    delete task.editingOriginalName;
    task.editing = false;
  }

  deleteTask(task: Task) {
    const children = this.getChildTasks(task);
    const message = children.length
      ? `Delete this task and its ${children.length} nested item(s)?`
      : 'Are you sure you want to delete this task?';
    if (!confirm(message)) return;
    this.tasks = this.tasks.filter(t => t !== task && !children.includes(t));
    this.updateParentCompletion(task);
    if (this.selectedTask === task) this.selectedTask = null;
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  // ------------------- History / Local Storage -------------------
  saveTasksToLocal() {
    const key = `checklist-${this.dateKey}`;
    localStorage.setItem(key, JSON.stringify(this.tasks));
  }

  private loadTodayTasksLocal() {
    const key = `checklist-${this.dateKey}`;
    const saved = localStorage.getItem(key);
    if (saved) this.tasks = JSON.parse(saved);
  }

  saveHistory() {
    const completion = Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
    const record: TaskHistory = {
      date: this.dateKey,
      tasks: JSON.parse(JSON.stringify(this.tasks)),
      completionPercentage: completion
    };
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    })
      .then(res => res.json())
      .then(() => alert('History saved!'))
      .catch(err => console.error(err));
  }

  loadHistory() {
    if (!this.searchDate) return;
    this.loadHistoryForDate(this.searchDate);
  }

  toggleHistoryView() {
    this.showHistory = !this.showHistory;
    if (this.showHistory && this.historyList.length === 0) {
      this.fetchHistoryList();
    }
  }

  fetchHistoryList() {
    this.historyLoading = true;
    fetch('/api/history')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load history');
        return res.json();
      })
      .then((data: HistorySummary[]) => {
        this.historyList = data;
        this.historyLoading = false;
        this.cdr.markForCheck();
      })
      .catch(err => {
        console.error('Failed to load history list:', err);
        this.historyLoading = false;
        this.cdr.markForCheck();
      });
  }

  viewHistoryEntry(date: string) {
    this.selectedHistoryDate = date;
    this.loadHistoryForDate(date);
  }

  private loadHistoryForDate(date: string) {
    fetch(`/api/history/${date}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data: TaskHistory) => {
        this.historyTasks = data.tasks;
        this.historyCompletion = data.completionPercentage;
        this.selectedHistoryDate = date;
        this.cdr.markForCheck();
      })
      .catch(() => {
        alert('No history found for this date');
        this.cdr.markForCheck();
      });
  }

  closeHistoryDetail() {
    this.historyTasks = [];
    this.historyCompletion = 0;
    this.selectedHistoryDate = '';
  }

  closeHistoryView() {
    this.showHistory = false;
    this.historyTasks = [];
    this.historyCompletion = 0;
    this.selectedHistoryDate = '';
  }
}
