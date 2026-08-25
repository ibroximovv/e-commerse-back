import {
  Controller,
  Post,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, resolve, normalize } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';

const multerConfig = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = './uploads';
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
    },
  }),
  fileFilter: (req: any, file: any, cb: any) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp|svg\+xml)$/)) {
      return cb(
        new BadRequestException(
          'Only image files (jpg, jpeg, png, gif, webp, svg) are allowed!',
        ),
        false,
      );
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
};

@ApiTags('Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/upload')
export class UploadController {
  @Post()
  @ApiOperation({ summary: 'Upload a single image file (Max 10MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', multerConfig))
  uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const filePath = `uploads/${file.filename}`;
    return {
      message: 'File uploaded successfully',
      url: filePath,
    };
  }

  @Post('multiple')
  @ApiOperation({
    summary: 'Upload multiple images at once (up to 10 files, max 10MB each)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10, multerConfig))
  uploadMultipleFiles(@UploadedFiles() files: any[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    const urls = files.map((file) => `uploads/${file.filename}`);
    return {
      message: `${files.length} file(s) uploaded successfully`,
      urls,
    };
  }

  @Delete()
  @ApiOperation({
    summary: 'Delete uploaded file by relative path (e.g. ?path=uploads/xxx.png)',
  })
  @ApiQuery({
    name: 'path',
    example: 'uploads/1712345678-123.png',
    description: 'Relative path to uploaded file',
  })
  deleteFile(@Query('path') rawPath: string) {
    if (!rawPath) {
      throw new BadRequestException('Path parameter is required');
    }

    const uploadsDir = resolve(process.cwd(), 'uploads');
    const normalizedTarget = resolve(process.cwd(), normalize(rawPath));

    // Security: ensure target path is inside uploads directory to prevent Directory Traversal
    if (!normalizedTarget.startsWith(uploadsDir)) {
      throw new BadRequestException('Invalid file path');
    }

    if (!fs.existsSync(normalizedTarget)) {
      throw new NotFoundException('File not found');
    }

    try {
      fs.unlinkSync(normalizedTarget);
      return { message: 'File deleted successfully' };
    } catch (e: any) {
      throw new BadRequestException(
        `Failed to delete file: ${e.message || 'Unknown error'}`,
      );
    }
  }
}
