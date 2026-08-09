import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { translate } from '../i18n/translations';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    // Optionally extract user language from JWT if not already authenticated (e.g. public routes)
    const reqAny = request as any;
    if (!reqAny.user && request.headers.authorization) {
      try {
        const token = request.headers.authorization.split(' ')[1];
        if (token) {
          const payloadBase64 = token.split('.')[1];
          const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
          reqAny.user = JSON.parse(payloadJson);
        }
      } catch (e) {
        // Fail silently
      }
    }

    const ln = (request.query.ln || reqAny.user?.language || 'uz').toString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resContent: any = exception.getResponse();
      error = resContent.error || exception.name;
      message = resContent.message || exception.message;
    } else if (exception.code === 'P2002') {
      // Prisma Unique Constraint violation
      status = HttpStatus.CONFLICT;
      error = 'Conflict';
      message = 'A record with this unique field already exists';
    } else if (exception.message) {
      message = exception.message;
    }

    // Translate single messages or message arrays
    if (typeof message === 'string') {
      message = translate(message, ln);
    } else if (Array.isArray(message)) {
      message = message.map((msg) => (typeof msg === 'string' ? translate(msg, ln) : msg));
    }

    error = translate(error, ln);

    // Logging errors
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - Error: ${exception.message || exception}`,
        exception.stack,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - Status: ${status} - Message: ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
