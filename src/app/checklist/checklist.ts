import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface Task {
  section: string;
  name: string;
  completed: boolean;
  editing?: boolean; // for inline editing
  parent?: string;   // name of the item this sub-item is nested under (same section)
  checks?: TaskCheck[]; // extra checkboxes on one item (e.g. time slots)
  countId?: number;  // set when the task comes from the backstock count schedule
}

export interface TaskCheck {
  label: string;
  completed: boolean;
}

export interface ScheduledCount {
  id: number;
  name: string;
  days: number[]; // 0 = Sunday ... 6 = Saturday
}

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

  // Backstock count schedule
  static readonly COUNT_SECTION = "Today's Counts";
  private static readonly LEGACY_COUNT_SECTION = 'Observations';
  private static readonly LEGACY_COUNT_TASK = 'Daily Backroom Counts';
  private static readonly BACKROOM_SECTION = 'Backroom/Daily Counts';
  readonly weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  countSchedule: ScheduledCount[] = [];
  private scheduleLoaded: boolean = false;
  showSchedule: boolean = false;
  scheduleError: string = '';
  newCountName: string = '';
  newCountDays: boolean[] = [false, false, false, false, false, false, false];

  // Sections removed from the checklist (left out of every day)
  removedSections: string[] = [];

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
    return [
    { section: 'Store Leader Walk', name: 'Grocery Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Drug/Gm Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Pick Up Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Produce/Floral Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Deli Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Bakery Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Meat and Seafood Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Front End Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Pharmacy Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Home Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Apparel Store Leader', completed: false },
    { section: 'Dept Leader', name: 'Grocery Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Drug/Gm Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Pick Up Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Produce/Floral Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Deli Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Starbucks Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Bakery Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Meat and Seafood Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Front End Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Pharmacy Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Home Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Apparel Dept Leader', completed: false },
    { section: 'Closing MOD Duties', name: 'Getting a Good Close GSC', completed: false },
    { section: 'Closing MOD Duties', name: 'Trash', completed: false },
    { section: 'Equipment Inspections', name: 'Balers', completed: false },
    { section: 'Equipment Inspections', name: 'Battery PIT (AM)', completed: false },
    { section: 'Equipment Inspections', name: 'Battery PIT (PM)', completed: false },
    { section: 'Equipment Inspections', name: 'Propane PIT (AM)', completed: false },
    { section: 'Equipment Inspections', name: 'Propane PIT (PM)', completed: false },
    { section: 'Equipment Inspections', name: 'Oven', completed: false },
    { section: 'Equipment Inspections', name: 'Slicers', completed: false },
    { section: 'Equipment Inspections', name: 'Meat Saw', completed: false },
    { section: 'Equipment Inspections', name: 'Grinder', completed: false },
    { section: 'Fresh Production', name: 'Bakery', completed: false },
    { section: 'Fresh Production', parent: 'Bakery', name: 'Prep for Today', completed: false },
    { section: 'Fresh Production', parent: 'Bakery', name: 'Prep for Tomorrow', completed: false },
    { section: 'Fresh Production', parent: 'Bakery', name: 'Thaw and Sell', completed: false },
    { section: 'Fresh Production', parent: 'Bakery', name: 'Cookies', completed: false },
    { section: 'Fresh Production', name: 'Deli', completed: false },
    { section: 'Fresh Production', parent: 'Deli', name: 'FSGNG', completed: false },
    { section: 'Fresh Production', parent: 'Deli', name: 'Hot Production', completed: false, checks: this.makeChecks(['12pm', '2pm', '4pm', '6pm']) },
    { section: 'Fresh Production', parent: 'Deli', name: 'Cold Production', completed: false },
    { section: 'Fresh Production', parent: 'Deli', name: 'Thaw and Sell', completed: false },
    { section: 'Fresh Production', name: 'Meat', completed: false },
    { section: 'Fresh Production', parent: 'Meat', name: 'Production', completed: false },
    { section: 'Fresh Production', parent: 'Meat', name: 'Meat Thaw and Sell', completed: false },
    { section: 'Fresh Production', parent: 'Meat', name: 'Seafood Thaw and Sell', completed: false, checks: this.makeChecks(['12pm', '4pm']) },
    { section: 'Fresh Production', name: 'Starbucks', completed: false },
    { section: 'Fresh Production', name: 'Murrays', completed: false },
    { section: 'Replenishment', name: 'HABA', completed: false },
    { section: 'Replenishment', name: 'Produce', completed: false },
    { section: 'Backroom/Daily Counts', name: 'Produce', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', parent: 'Produce', name: 'Produce Bulk', completed: false },
    { section: 'Backroom/Daily Counts', name: 'Deli', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', parent: 'Deli', name: 'Deli Bulk', completed: false },
    { section: 'Backroom/Daily Counts', name: 'Bakery', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: "Murray's", completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'Meat', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'Seafood', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', parent: 'Seafood', name: 'Seafood Bulk', completed: false },
    { section: 'Backroom/Daily Counts', name: 'Grocery', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'HBC', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'Comm Bakery', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'Dairy', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'Liquor', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'Packaged Meat', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'Pharmacy', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    { section: 'Backroom/Daily Counts', name: 'Tobacco', completed: false, checks: this.makeChecks(['Backroom', 'Daily Counts']) },
    ];
  }

  private makeChecks(labels: string[]): TaskCheck[] {
    return labels.map(label => ({ label, completed: false }));
  }

  /**
   * Brings a saved day up to the current layout: renames the old "Observations" section to
   * "Today's Counts", drops the retired "Daily Backroom Counts" item, drops sections that were
   * removed, drops stray top-level copies of default sub-items and adds missing default
   * sub-items. Returns true if tasks changed.
   */
  private normalizeTasks(tasks: Task[]): boolean {
    let changed = false;
    const defaults = this.getDefaultTasks();
    const isDefaultTopLevel = (t: Task) =>
      defaults.some(d => !d.parent && d.section === t.section && d.name === t.name);
    const isDefaultSubItem = (t: Task) =>
      defaults.some(d => d.parent && d.section === t.section && d.name === t.name);
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      if (this.removedSections.includes(t.section)) {
        tasks.splice(i, 1);
        changed = true;
        continue;
      }
      // An older app version saved some sub-items a second time without their parent. Keep
      // their progress on the nested copy listed just above them, then drop the stray copy.
      if (!t.parent && t.countId == null && isDefaultSubItem(t) && !isDefaultTopLevel(t)) {
        const twin = tasks
          .slice(0, i)
          .reverse()
          .find(o => o.parent && o.section === t.section && o.name === t.name);
        if (twin) {
          twin.completed = twin.completed || t.completed;
          for (const check of twin.checks ?? []) {
            if (t.checks?.some(c => c.label === check.label && c.completed)) check.completed = true;
          }
          tasks.splice(i, 1);
          changed = true;
          continue;
        }
      }
      if (t.section === ChecklistComponent.LEGACY_COUNT_SECTION) {
        t.section = ChecklistComponent.COUNT_SECTION;
        changed = true;
      }
      if (t.section === ChecklistComponent.COUNT_SECTION && !t.parent &&
          t.countId == null && t.name === ChecklistComponent.LEGACY_COUNT_TASK) {
        tasks.splice(i, 1);
        changed = true;
      }
    }
    changed = this.mergeDefaultSubItems(tasks) || changed;
    const before = tasks.map(t => t.completed).join();
    this.syncParents(tasks);
    return tasks.map(t => t.completed).join() !== before || changed;
  }

  /**
   * Adds any default sub-items missing from a saved day (placed after their parent's
   * last existing sub-item). Returns true if tasks changed.
   */
  private mergeDefaultSubItems(tasks: Task[]): boolean {
    let changed = false;
    for (const def of this.getDefaultTasks()) {
      if (!def.parent) continue;
      const existing = tasks.find(
        t => t.section === def.section && t.parent === def.parent && t.name === def.name
      );
      if (existing) {
        if (def.checks && !existing.checks) {
          existing.checks = def.checks;
          changed = true;
        }
        continue;
      }
      let insertAt = -1;
      tasks.forEach((t, i) => {
        if (t.section === def.section &&
            ((t.name === def.parent && !t.parent) || t.parent === def.parent)) {
          insertAt = i;
        }
      });
      if (insertAt !== -1) {
        tasks.splice(insertAt + 1, 0, { ...def });
        changed = true;
      }
    }
    if (changed) this.syncParents(tasks);
    return changed;
  }

  /** Day of week (0 = Sunday) for the checklist's current Pacific date */
  private getCurrentWeekday(): number {
    return new Date(`${this.dateKey}T12:00:00Z`).getUTCDay();
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
    await Promise.all([this.loadSchedule(), this.loadRemovedSections()]);
    try {
      const res = await fetch(`/api/checklist/${this.getDateKey()}`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      if (data.exists && data.tasks && data.tasks.length > 0) {
        this.tasks = data.tasks;
        this.cloudVersion = data.version;
        const merged = this.normalizeTasks(this.tasks);
        if (this.applySchedule() || merged) {
          await this.saveToCloud();
        }
      } else {
        // No cloud data yet — use defaults (or localStorage as migration)
        const localKey = `checklist-${this.dateKey}`;
        const saved = localStorage.getItem(localKey);
        if (saved) {
          this.tasks = JSON.parse(saved);
        }
        this.normalizeTasks(this.tasks);
        this.applySchedule();
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
          ...(t.countId != null ? { countId: t.countId } : {}),
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
        const normalized = this.normalizeTasks(this.tasks);
        if (this.applySchedule() || normalized) {
          this.debouncedSaveToCloud();
        }
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
    await Promise.all([this.loadSchedule(), this.loadRemovedSections()]);

    try {
      const res = await fetch(`/api/checklist/${this.getDateKey()}`);
      if (!res.ok) throw new Error('Failed to refresh');

      const data = await res.json();
      if (data.exists && data.tasks && data.tasks.length > 0) {
        this.cloudVersion = data.version;
        this.tasks = data.tasks;
      }
      const normalized = this.normalizeTasks(this.tasks);
      if (this.applySchedule() || normalized) {
        this.debouncedSaveToCloud();
      }
      this.saveTasksToLocal();
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

  // ------------------- Backstock Count Schedule -------------------
  private async loadSchedule(): Promise<void> {
    try {
      const res = await fetch('/api/counts');
      if (!res.ok) throw new Error('Failed to load count schedule');
      this.countSchedule = await res.json();
      this.scheduleLoaded = true;
      this.scheduleError = '';
    } catch (err) {
      console.error('Failed to load count schedule:', err);
      this.scheduleError = 'Could not load the count schedule.';
    }
  }

  /**
   * Makes today's checklist contain exactly the counts scheduled for today's weekday,
   * keeping completion state for counts already on the list. Returns true if tasks changed.
   */
  private applySchedule(): boolean {
    if (!this.scheduleLoaded) return false;

    const weekday = this.getCurrentWeekday();
    const section = ChecklistComponent.COUNT_SECTION;
    const before = JSON.stringify(this.tasks.map(t => [t.section, t.name, t.completed, t.countId]));
    const scheduledNames = new Set(this.countSchedule.map(c => c.name));

    // A task belongs to the count slot if it is tagged with a count id, or is an untagged
    // copy of a scheduled count (a device still running an earlier app version strips
    // the count id when it saves).
    const isCountSlot = (t: Task) =>
      !t.parent && (t.countId != null || (t.section === section && scheduledNames.has(t.name)));

    const byId = new Map(this.tasks.filter(t => t.countId != null).map(t => [t.countId, t]));
    const byName = new Map(
      this.tasks.filter(t => t.countId == null && isCountSlot(t)).map(t => [t.name, t])
    );

    const sectionRemoved = this.removedSections.includes(section);
    const dueTasks: Task[] = this.countSchedule
      .filter(c => !sectionRemoved && c.days.includes(weekday))
      .map(c => {
        const task = byId.get(c.id) ?? byName.get(c.name) ?? { section, name: c.name, completed: false };
        task.name = c.name;
        task.section = section;
        task.countId = c.id;
        return task;
      });

    const result: Task[] = [];
    let inserted = false;
    for (const t of this.tasks) {
      if (isCountSlot(t)) {
        if (!inserted) {
          result.push(...dueTasks);
          inserted = true;
        }
        continue;
      }
      result.push(t);
    }
    if (!inserted) {
      let idx = result.findIndex(t => t.section === ChecklistComponent.COUNT_SECTION);
      if (idx < 0) idx = result.findIndex(t => t.section === ChecklistComponent.BACKROOM_SECTION);
      result.splice(idx >= 0 ? idx : result.length, 0, ...dueTasks);
    }

    this.tasks = result;
    if (this.selectedTask && !result.includes(this.selectedTask)) this.selectedTask = null;
    return JSON.stringify(result.map(t => [t.section, t.name, t.completed, t.countId])) !== before;
  }

  /** Re-sync today's checklist after the schedule was edited */
  private async afterScheduleChange(): Promise<void> {
    await Promise.all([this.loadSchedule(), this.loadRemovedSections()]);
    if (this.applySchedule()) {
      this.saveTasksToLocal();
      this.debouncedSaveToCloud();
    }
    this.cdr.markForCheck();
  }

  toggleScheduleView() {
    this.showSchedule = !this.showSchedule;
    if (this.showSchedule) this.afterScheduleChange();
  }

  getCurrentWeekdayForView(): number {
    return this.getCurrentWeekday();
  }

  countsDueToday(): ScheduledCount[] {
    const weekday = this.getCurrentWeekday();
    return this.countSchedule.filter(c => c.days.includes(weekday));
  }

  async addCount() {
    const name = this.newCountName.trim();
    if (!name) return;
    const days = this.newCountDays.map((on, i) => (on ? i : -1)).filter(i => i >= 0);
    try {
      const res = await fetch('/api/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, days }),
      });
      if (!res.ok) throw new Error('Failed to add count');
      this.newCountName = '';
      this.newCountDays = [false, false, false, false, false, false, false];
    } catch (err) {
      console.error(err);
      alert('Could not add the count. Please try again.');
    }
    await this.afterScheduleChange();
  }

  private async updateCount(count: ScheduledCount, changes: Partial<ScheduledCount>) {
    try {
      const res = await fetch(`/api/counts/${count.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error('Failed to update count');
    } catch (err) {
      console.error(err);
      alert('Could not update the count. Please try again.');
    }
    await this.afterScheduleChange();
  }

  toggleCountDay(count: ScheduledCount, day: number) {
    const days = count.days.includes(day)
      ? count.days.filter(d => d !== day)
      : [...count.days, day];
    count.days = days; // optimistic update
    this.updateCount(count, { days });
  }

  renameCount(count: ScheduledCount, newName: string) {
    const name = newName.trim();
    if (!name || name === count.name) return;
    this.updateCount(count, { name });
  }

  async deleteCount(count: ScheduledCount) {
    if (!confirm(`Remove "${count.name}" from the count schedule?`)) return;
    try {
      const res = await fetch(`/api/counts/${count.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete count');
    } catch (err) {
      console.error(err);
      alert('Could not remove the count. Please try again.');
    }
    await this.afterScheduleChange();
  }

  // ------------------- Removed Sections -------------------
  private async loadRemovedSections(): Promise<void> {
    try {
      const res = await fetch('/api/sections/removed');
      if (!res.ok) throw new Error('Failed to load removed sections');
      this.removedSections = await res.json();
    } catch (err) {
      console.error('Failed to load removed sections:', err);
    }
  }

  async removeSection(section: string) {
    if (!confirm(`Remove the whole "${section}" section from the checklist? It stays off the list on future days until you restore it.`)) return;
    try {
      const res = await fetch('/api/sections/removed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: section }),
      });
      if (!res.ok) throw new Error('Failed to remove section');
    } catch (err) {
      console.error(err);
      alert('Could not remove the section. Please try again.');
      return;
    }
    if (!this.removedSections.includes(section)) this.removedSections.push(section);
    this.tasks = this.tasks.filter(t => t.section !== section);
    if (this.selectedTask && this.selectedTask.section === section) this.selectedTask = null;
    if (this.newTaskSection === section) this.newTaskSection = '';
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
    this.cdr.markForCheck();
  }

  async restoreSection(section: string) {
    try {
      const res = await fetch('/api/sections/removed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: section }),
      });
      if (!res.ok) throw new Error('Failed to restore section');
    } catch (err) {
      console.error(err);
      alert('Could not restore the section. Please try again.');
      return;
    }
    this.removedSections = this.removedSections.filter(s => s !== section);

    // Put the section's default items back where the section normally sits
    const defaults = this.getDefaultTasks();
    const order = [...new Set(defaults.map(t => t.section))];
    const restored = defaults.filter(t => t.section === section);
    const later = new Set(order.slice(order.indexOf(section) + 1));
    const at = order.includes(section) ? this.tasks.findIndex(t => later.has(t.section)) : -1;
    this.tasks.splice(at >= 0 ? at : this.tasks.length, 0, ...restored);
    this.applySchedule();
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
    this.cdr.markForCheck();
  }

  // ------------------- Task Management -------------------
  toggleTask(task: Task) {
    // Items with sub-items or sub-checks check themselves when everything below is done
    if (this.isAutoCompleted(task)) return;
    task.completed = !task.completed;
    this.syncParents(this.tasks);
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  toggleCheck(check: TaskCheck) {
    check.completed = !check.completed;
    this.syncParents(this.tasks);
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  private isParentOf(parent: Task, child: Task): boolean {
    return !parent.parent && child.parent === parent.name && child.section === parent.section;
  }

  getChildTasks(task: Task): Task[] {
    return this.tasks.filter(t => this.isParentOf(task, t));
  }

  hasChildren(task: Task): boolean {
    return this.tasks.some(t => this.isParentOf(task, t));
  }

  isAutoCompleted(task: Task): boolean {
    return this.hasChildren(task) || !!task.checks?.length;
  }

  /**
   * An item with sub-checks is complete when all of its checks are done, and a parent item is
   * complete when all of its sub-items (and its own checks) are done
   */
  private syncParents(tasks: Task[]) {
    const checksDone = (t: Task) => (t.checks ?? []).every(c => c.completed);
    for (const task of tasks) {
      if (task.parent && task.checks?.length) task.completed = checksDone(task);
    }
    for (const task of tasks) {
      if (task.parent) continue;
      const children = tasks.filter(t => t.parent === task.name && t.section === task.section);
      if (children.length > 0 || task.checks?.length) {
        task.completed = children.every(c => c.completed) && checksDone(task);
      }
    }
  }

  /** Section tasks ordered so each sub-item appears directly under its parent */
  getDisplayTasks(section: string): Task[] {
    const sectionTasks = this.getTasksBySection(section);
    const topLevel = sectionTasks.filter(
      t => !t.parent || !sectionTasks.some(p => this.isParentOf(p, t))
    );
    const ordered: Task[] = [];
    for (const task of topLevel) {
      ordered.push(task);
      if (!task.parent) ordered.push(...sectionTasks.filter(c => this.isParentOf(task, c)));
    }
    return ordered;
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

  private originalNames = new Map<Task, string>();

  startEditing(task: Task) {
    this.originalNames.set(task, task.name);
    task.editing = true;
  }

  saveEdit(task: Task, newName: string) {
    if (!newName.trim()) return;
    const oldName = this.originalNames.get(task) ?? task.name;
    if (!task.parent) {
      // Keep sub-items attached to a renamed parent
      this.tasks
        .filter(t => t !== task && t.parent === oldName && t.section === task.section)
        .forEach(t => (t.parent = newName.trim()));
    }
    this.originalNames.delete(task);
    task.name = newName.trim();
    task.editing = false;
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  cancelEdit(task: Task) {
    const original = this.originalNames.get(task);
    if (original !== undefined) task.name = original;
    this.originalNames.delete(task);
    task.editing = false;
  }

  deleteTask(task: Task) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    const children = this.getChildTasks(task);
    this.tasks = this.tasks.filter(t => t !== task && !children.includes(t));
    if (this.selectedTask === task) this.selectedTask = null;
    this.syncParents(this.tasks);
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
    if (saved) {
      this.tasks = JSON.parse(saved);
      this.normalizeTasks(this.tasks);
    }
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
