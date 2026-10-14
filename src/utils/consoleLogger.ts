/**
 * Global Real-time Console Logger
 * Provides a unified log store accessible from AutoDubbingModal, Header, and Global Modals.
 */

export interface ConsoleLogItem {
  id: string;
  time: string;
  type: 'info' | 'stage' | 'success' | 'warn' | 'error';
  text: string;
}

type LogListener = (logs: ConsoleLogItem[]) => void;

class ConsoleLogger {
  private logs: ConsoleLogItem[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs: number = 800;

  constructor() {
    // Initial welcome log
    this.add(
      '🚀 JAI DUBBER Console Logger v1.0.5 initialized. Ready for dubbing and AI tasks.',
      'info'
    );
  }

  public add(text: string, type: ConsoleLogItem['type'] = 'info'): void {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const item: ConsoleLogItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time,
      type,
      text,
    };

    this.logs.push(item);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(this.logs.length - this.maxLogs);
    }

    this.notify();
  }

  public getAll(): ConsoleLogItem[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    // Initial call
    listener(this.getAll());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const current = this.getAll();
    this.listeners.forEach((fn) => {
      try {
        fn(current);
      } catch (err) {
        console.error('Logger listener error:', err);
      }
    });
  }
}

export const globalConsoleLogger = new ConsoleLogger();
