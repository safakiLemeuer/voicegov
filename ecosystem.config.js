// ecosystem.config.js — PM2 configuration for VoiceGov Scanner
module.exports = {
  apps: [
    {
      name: 'voicegov-api',
      script: 'server.js',
      cwd: '/var/www/voicegov-scanner',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '256M',
      error_file: '/var/log/voicegov/api-error.log',
      out_file: '/var/log/voicegov/api-out.log',
    },
    {
      name: 'voicegov-scheduler',
      script: 'caller/scheduler.js',
      cwd: '/var/www/voicegov-scanner',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '128M',
      error_file: '/var/log/voicegov/scheduler-error.log',
      out_file: '/var/log/voicegov/scheduler-out.log',
    },
    {
      name: 'voicegov-web',
      script: 'web/leaderboard-server.js',
      cwd: '/var/www/voicegov-scanner',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '128M',
      error_file: '/var/log/voicegov/web-error.log',
      out_file: '/var/log/voicegov/web-out.log',
    },
  ],
};
