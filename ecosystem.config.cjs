// ecosystem.config.cjs
// pm2 process definitions for Transcrib production (api + worker)
// Node interpreter pinned to TECH-017 result: Node 20.20.2 under deploy's nvm
module.exports = {
  apps: [
    {
      name: 'transcrib-api',
      cwd: '/opt/transcrib/api',
      script: './dist/index.js',
      interpreter: '/home/deploy/.nvm/versions/node/v20.20.2/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      max_memory_restart: '512M',
      kill_timeout: 30000,
      autorestart: true,
      watch: false,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
    },
    {
      name: 'transcrib-worker',
      cwd: '/opt/transcrib/worker',
      script: './dist/index.js',
      interpreter: '/home/deploy/.nvm/versions/node/v20.20.2/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      max_memory_restart: '1024M',
      kill_timeout: 30000,
      autorestart: true,
      watch: false,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
    },
  ],
};
