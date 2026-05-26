module.exports = {
  apps: [
    {
      name: "iqnaax-backend",
      cwd: "./backend-node",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      error_file: "./backend-node/logs/pm2-error.log",
      out_file: "./backend-node/logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
  ],
};
