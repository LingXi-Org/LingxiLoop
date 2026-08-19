// PM2 process definition for running the LingxiLoop API server in
// production (e.g. via BaoTa/aaPanel's Node.js project manager, which
// runs pm2 under the hood).
//
// Why this exists: without an explicit log-rotation policy, pm2 (and
// therefore any panel — BaoTa included — that reads its log files)
// captures stdout/stderr into a single ever-growing file. Left alone
// for weeks of normal operation this can reach a size where opening it
// in a log viewer that reads/tails the whole file server-side spikes
// memory/CPU and can crash the box the app runs on. `max_size` here
// caps each log file and lets pm2 rotate it.
//
// Usage: `pm2 start ecosystem.config.cjs` (or point BaoTa's "启动文件"
// at this file instead of directly at `tsx server/src/index.ts`).
// Log rotation additionally requires the pm2-logrotate module:
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 20M
//   pm2 set pm2-logrotate:retain 7
//   pm2 set pm2-logrotate:compress true
module.exports = {
  apps: [
    {
      name: 'lingxiloop',
      script: 'node_modules/.bin/tsx',
      args: 'server/src/index.ts',
      cwd: __dirname,
      out_file: './logs/lingxiloop-out.log',
      error_file: './logs/lingxiloop-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
