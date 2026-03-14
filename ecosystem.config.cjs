/** @type { import('pm2').StartOptions } */
module.exports = {
  apps: [
    {
      name: 'fadun',
      script: 'server/src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
    },
  ],
}
