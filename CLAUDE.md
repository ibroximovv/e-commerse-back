# CLAUDE.md - E-commerce Backend Guide

This guide details commands, directory structures, and code patterns for this NestJS + Prisma + MongoDB e-commerce project.

## Core Commands

### Development & Builds
- Run development server (watch mode): `npm run start:dev`
- Compile production build: `npm run build`
- Run linter: `npm run lint`
- Format code: `npm run format`

### Database & Prisma
- Validate Prisma schema: `npx prisma validate`
- Generate Prisma Client: `npx prisma generate`
- Seed the database: `npx prisma db seed`

---

## Architectural Guidelines

### 1. Database & Prisma Configuration
- **Database Engine:** MongoDB (`provider = "mongodb"`).
- **ORM Version:** **Prisma v6** (Maintenance line). Do NOT upgrade to Prisma v7 because it has no MongoDB connector.
- **Identifiers:** Primary key `id` fields must be UUID strings mapped to `_id` in MongoDB:
  ```prisma
  id String @id @default(uuid()) @map("_id")
  ```
- **Naming Style:** All database schema columns and relationship fields must be in `snake_case` (e.g. `created_at`, `updated_at`, `category_id`, `is_archived`).

### 2. NestJS Directory Structure
- All business resource modules (module, service, controller, DTOs) must reside inside `src/api/`.
- Generate new resources using:
  ```bash
  npx nest g res api/<name> --no-spec --type rest --crud
  ```
- File uploads: Handled in `src/api/upload/` using Multer. Uploaded files go to `./uploads` and are served statically at `/uploads`.

### 3. Authentication & Security
- **Stateless Tokens:** JWT access and refresh tokens are signed and verified without database state.
- **Stateless OTP Verification:** Signups send a 6-digit code via Nodemailer. The OTP codes and their 1-minute resend cooldowns are cached in-memory inside `AuthService` using a Map.
- **User Role Management:** Users have a `role` of `ADMIN` or `USER`. Endpoints are protected by `JwtAuthGuard` and `RolesGuard`.
- **Response Safety:** The `ResponseInterceptor` runs all return values through the translation helper which automatically strips out `password` fields from JSON payloads globally.

### 4. Code Reusability & DTOs
- Services doing standard CRUD should inherit from [BaseService](file:///Users/omadbek/new-project/e-commerse/src/common/services/base.service.ts).
- Queries listing database entries should inherit from [PaginationQueryDto](file:///Users/omadbek/new-project/e-commerse/src/common/dto/pagination-query.dto.ts).

### 5. Localization (`?ln`)
- Supported languages: `uz`, `ru`, `en`. Default is `uz`.
- Fallback chain: The `ResponseInterceptor` and `HttpExceptionFilter` resolve the selected language via `request.query.ln` $\rightarrow$ `request.user.language` (extracted from the JWT token) $\rightarrow$ `'uz'`.
- Even on public routes, if an `Authorization` header is present, the language is parsed from the JWT payload.
- Translation mappings are stored in [translations.ts](file:///Users/omadbek/new-project/e-commerse/src/common/i18n/translations.ts). If `en` is active, no translation is applied.
