# Lynxoria — клиент

Фронтенд на React, Vite и Tailwind CSS для защищённых чатов, видеозвонков и совместной доски.

## Основные команды

```bash
npm install    # установка зависимостей
npm run dev    # запуск в режиме разработки
npm run build  # production-сборка
npm run lint   # проверка кода ESLint
npm run preview # предпросмотр production-сборки
```

### Пример reverse-proxy для Nginx

```
server {
    server_name lynxoria.app;

    location / {
        root   /var/www/lynxoria/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

См. подробности и общие инструкции в [корневом README](../README.md).
