import pino from 'pino';

const statusLabels: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export const logger = pino({
  level: 'info',
  formatters: {
    level: (label, number) => {
      return { status: statusLabels[number] || label };
    },
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  base: undefined, // Remove pid, hostname, name
});
