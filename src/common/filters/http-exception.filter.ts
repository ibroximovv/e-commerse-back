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
import { resolveRequestLanguage } from '../i18n/request-language';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const ln = resolveRequestLanguage(request as any);

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
      message = message.map((msg) =>
        typeof msg === 'string' ? translate(msg, ln) : msg,
      );
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
      language: ln,
      timestamp: new Date().toISOString(),
    });
  }
}
