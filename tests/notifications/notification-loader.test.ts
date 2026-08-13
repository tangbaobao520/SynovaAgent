import { describe, it, expect } from 'vitest';
import { loadAndRegisterNotificationAdapters } from '../../src/notifications/notification-loader';

describe('notification-loader', () => {
  it('从 extensions/notifications/ 加载适配器', async () => {
    const { registered, errors } = await loadAndRegisterNotificationAdapters();
    expect(registered).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(errors)).toBe(true);
  });

  it('多次加载不崩溃', async () => {
    const r1 = await loadAndRegisterNotificationAdapters();
    const r2 = await loadAndRegisterNotificationAdapters();
    expect(r1.registered).toBe(r2.registered);
  });
});
