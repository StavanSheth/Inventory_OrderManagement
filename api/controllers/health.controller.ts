import { HealthData } from '../../shared/schemas/health.schema';

export class HealthController {
  static getHealth(dbBound: boolean = false): HealthData {
    const uptimeSeconds =
      typeof process !== 'undefined' && typeof process.uptime === 'function'
        ? Math.floor(process.uptime())
        : 0;

    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      ...(dbBound ? { database: 'connected' } : {}),
    };
  }
}
