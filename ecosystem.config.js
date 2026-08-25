module.exports = {
  apps: [
    {
      name: 'e-commerse-back',
      script: 'dist/main.js',
      cwd: '/var/www/e-commerse-back', // .env shu papkadan o'qiladi
      instances: 1, // 'max' qilib bo'lmaydi: OTP kodlar AuthService ichida
      // xotirada (Map) saqlanadi, cluster'da har bir worker'da alohida bo'lib qoladi.
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/pm2/e-commerse-back.error.log',
      out_file: '/var/log/pm2/e-commerse-back.out.log',
      merge_logs: true,
    },
  ],
};
