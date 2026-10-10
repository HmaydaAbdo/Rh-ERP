import { Injectable, signal } from '@angular/core';

export type NotificationSeverity = 'success' | 'info' | 'warn' | 'error';

export interface NotificationInput {
  severity: NotificationSeverity;
  summary: string;
  detail?: string;
  life?: number;
}

export interface AppNotification extends NotificationInput {
  id: number;
}

export interface ConfirmationRequest {
  header: string;
  message: string;
  acceptLabel?: string;
  rejectLabel?: string;
  accept?: () => void;
  reject?: () => void;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notifications = signal<readonly AppNotification[]>([]);
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  add(input: NotificationInput): void {
    const notification = { ...input, id: ++this.nextId };
    this.notifications.update((current) => [...current, notification]);
    const duration = input.life ?? 5000;
    if (duration > 0) {
      this.timers.set(notification.id, setTimeout(() => this.remove(notification.id), duration));
    }
  }

  remove(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.notifications.update((current) => current.filter((notification) => notification.id !== id));
  }
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly request = signal<ConfirmationRequest | null>(null);
  private previousFocus: HTMLElement | null = null;

  confirm(request: ConfirmationRequest): void {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.request.set(request);
  }

  accept(): void {
    const request = this.request();
    this.close();
    request?.accept?.();
  }

  reject(): void {
    const request = this.request();
    this.close();
    request?.reject?.();
  }

  private close(): void {
    this.request.set(null);
    queueMicrotask(() => this.previousFocus?.focus());
    this.previousFocus = null;
  }
}
