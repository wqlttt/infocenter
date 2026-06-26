import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';

// createParamDecorator 是 NestJS官方提供的工具函数，专门用来创建自定义的参数装饰器
export const CurrentUser = createParamDecorator(
  // _data: 代表在使用装饰器时传给它的参数，例如 @Currentuser('userId') 这里用不到，所以需要忽略它 所以加了下划线 _
  // ctx: 执行上下文 (Execution Context), 它是NestJS的核心对象，包含了当前请求的各种底层细节
  (_data: unknown, ctx: ExecutionContext): AuthUser => {

    // 1. 通过 ctx.switchToHttp().getRequest()，从多模态的上下文中(NestJS支持 HTTP/ PRC / WebSocket)
    //   切换到标准的 HTTP 模式， 并拿到原生底层的 Express / Fastify 请求对象(Request)
    const request = ctx.switchToHttp().getRequest();

    // 2. 返回挂载在 request 对象上的 user 属性
    // [关键背景]: 在通常的JWT鉴权流程中，你的AuthGuard(守位)在拦截并验证Token后，把解密出来的用户信息赋值给 request.user = decodeUser;
    // 这里逻辑就是吧守卫存进去的 user 拿出来返回
    return request.user;
  },
);
