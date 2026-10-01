import { HealthData } from '../../shared/schemas/health.schema';

export class HealthController {
  static getHealth(): HealthData {
    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime ? Math.floor(process.uptime()) : 0,
    };
  }
}
