/**
 * InfoCenter 服务端入口
 *
 * NestJS 应用 bootstrap：加载 AppModule、配置全局中间件后监听 HTTP。
 *
 * ## 与消息推送相关的前置配置
 * - CORS 显式允许 `Last-Event-ID` 请求头（SSE 断点续传）
 * - CORS 暴露 `Last-Event-ID` 响应头（部分客户端可读）
 * - 默认端口 3000，可通过环境变量 PORT 覆盖
 *
 * ## 本地开发
 * ```bash
 * cd server && yarn seed && yarn start:dev
 * ```
 * 前端 Vite 将 /api 代理到 http://localhost:3000
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const jsonLimit = process.env.JSON_BODY_LIMIT || '100kb';
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: jsonLimit }));
  app.use(urlencoded({ extended: true, limit: jsonLimit }));
  const config = app.get(ConfigService);

  // 基础安全头；关闭 CSP 以免干扰本地 SSE / 前端 dev server
  app.use(helmet({ contentSecurityPolicy: false }));

  /**
   * 跨域：允许前端 dev server、本地回环地址及 devtunnels 调试
   * credentials: true 以便携带 Authorization（JWT）
   */
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = config.get('CORS_ORIGIN', 'http://localhost:5173');
      const list = allowed.split(',').map((o: string) => o.trim());
      if (
        !origin ||
        list.includes(origin) ||
        /^http:\/\/localhost(:\d+)?$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        /^https:\/\/[\w-]+(\.[\w-]+)*\.devtunnels\.ms$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    // SSE：浏览器 / fetch-event-source 需在重连请求中携带 Last-Event-ID
    exposedHeaders: ['Last-Event-ID'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });

  // 全局 DTO 校验：剥离未声明字段、自动类型转换
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}

bootstrap();
