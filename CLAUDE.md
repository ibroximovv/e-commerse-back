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
- Import the OCO print catalog: `npm run db:import:catalog` (add `-- --dry-run` first)
- Wipe the existing catalog before a clean import: `npm run db:reset:catalog` (reports only; `-- --yes`, plus `--with-orders` when orders exist — users are never touched)
- Re-extract product photos from the catalog PDF: `npm run catalog:images -- "<file.pdf>"` (needs `poppler-utils` + `imagemagick`, dev machine only)
- Migrate pre-existing single-language documents: `npm run db:backfill`
- Audit Payme fiscal (IKPU) coverage: `npm run db:check:ikpu` (add `-- --all` to list every product)
- Exercise the whole Payme protocol against a running server: `npm run payme:selftest` (needs `PAYME_KEY` set for both the server and the script; `-- --url <host>` targets a deployed instance)

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
- **Flat catalog:** `Category` has **no self-relation**. The printed OCO catalog has exactly 8 top-level sections and no subcategories, so `parent_id`/`children`, the category tree, breadcrumbs and descendant expansion were all removed. Do not reintroduce them.

### 2. NestJS Directory Structure
- All business resource modules (module, service, controller, DTOs) must reside inside `src/api/`.
- Generate new resources using:
  ```bash
  npx nest g res api/<name> --no-spec --type rest --crud
  ```
- File uploads: Handled in `src/api/upload/` using Multer. Uploaded files go to `./uploads` and are served statically at `/uploads`.

### 3. Multilingual Data (`uz` / `ru` / `en`)
- **Storage:** every translatable catalog field lives in **three columns**, not a dictionary: `name_uz`/`name_ru`/`name_en`, `description_*`, and on `ProductAttribute` — `key_*`, `value_*`, `unit_*`. MongoDB indexes plain columns well but not nested paths, so sorting by `name_<lang>` stays fast.
- **Reading:** `ResponseInterceptor` calls `localizeObject()` ([locale.ts](file:///home/baxa/coding/e-commerse-back/src/common/i18n/locale.ts)), which collapses every `X_uz`/`X_ru`/`X_en` triple into a single `X` for the requested language and strips the raw columns. Fallback chain: requested → `uz` → `ru` → `en` → `null`. Admin edit forms get all languages back with `?raw=true`.
- **Writing:** DTOs take `{uz, ru, en}` objects (`LocalizedTextDto`), and services expand them with `spreadLocalized` / `spreadLocalizedRequired`. At least one language is required (`@HasAtLeastOneLanguage`); blank ones are filled from whichever language was supplied, so a product is never nameless.
- **Never** put catalog text in [translations.ts](file:///home/baxa/coding/e-commerse-back/src/common/i18n/translations.ts). That dictionary is only for **system messages and errors**, keyed by their English source string. The original bug was catalog names being looked up there: Russian DB text was never a dictionary key, so it came back unchanged in every language.
- **Queries:** search runs `OR` across all three languages, so a Russian term still matches in the Uzbek UI. `sort=name_asc` and facet labels use the current language via the `@CurrentLang()` decorator.

### 4. Authentication & Security
- **Stateless Tokens:** JWT access and refresh tokens are signed and verified without database state.
- **Stateless OTP Verification:** Signups send a 6-digit code (generated with `crypto.randomInt`) via Nodemailer. The OTP codes and their resend cooldowns are cached in-memory inside `AuthService` using a Map, with a periodic sweep of expired entries. A code allows 5 wrong attempts before it is discarded; the cooldown also applies to `register`, and every email is normalized to lowercase before lookup.
- **Mail Delivery:** The only delivery channel is email — there is no SMS provider. `MailService` (`src/common/services/mail.service.ts`, exported by the global `MailModule`) uses `nodemailer.createTransport({ service: 'gmail' })`, so the only credentials are `MAIL_USER` and a **Google App Password** in `MAIL_PASS` — no SMTP host/port/secure settings. Spaces in the app password are stripped automatically. `sendSmsToMail(email, subject, text, html?)` is the general send method; `sendVerificationCode()` wraps it for OTP mails. The connection is verified at startup, and send failures throw instead of being swallowed. See [.env.example](file:///Users/omadbek/new-project/e-commerse/.env.example).
- **User Role Management:** Users have a `role` of `ADMIN` or `USER`. Endpoints are protected by `JwtAuthGuard` and `RolesGuard`. `UsersService` refuses to demote or delete the **last remaining ADMIN**, and an admin cannot demote or delete their own account — without this the panel can be locked out permanently, since the only other way to mint an admin is the seed.
- **No account enumeration:** `POST /api/auth/forgot-password` returns the same message whether or not the email exists; the OTP is only sent to a real, verified account.
- **Response Safety:** The `ResponseInterceptor` runs all return values through the translation helper which automatically strips out `password` fields from JSON payloads globally.

### 5. Pricing & Catalog Data
- **Price on request:** `Product.price_on_request` marks goods sold at a negotiated price (the printed OCO catalog lists no prices). When it is `true` the service forces `price`/`final_price` to `0`, drops any discount, and `CartsService`/`OrdersService` reject the product with a `400`. These products are also excluded from the `facets.price` range, and `?price_on_request=` filters them either way.
- **Attribute units:** in the API `ProductAttribute` is `{ key, value, unit? }`, each a `{uz, ru, en}` object (stored as `key_*`/`value_*`/`unit_*`). Keep the unit out of the key (`key: 'Мощность'`, `value: '250'`, `unit: 'Вт'` — not `key: 'Мощность,W'`) so one spec stays a single facet group and numeric values sort correctly. Numeric values are written identically in all three languages; only text values (`Медный`/`Mis`/`Copper`) actually differ.
- **Facet identity:** facets group by the `_en` variant and expose it as `key`/`value`, with a separate `label` in the current language. The identifier must stay language-independent, otherwise a user's filter selection would break the moment they switch languages.
- **SKU:** normalized to trimmed UPPERCASE on write and checked case-insensitively. Uniqueness is enforced in `ProductsService`, **not** by a DB index — a Prisma/MongoDB `@unique` on the optional `sku` would reject a second document with `sku: null`. Where the catalog sells one model in two materials (QB-60, JET 750/1100, LPS 15-9 Z) the SKU carries a material suffix (`-AL`, `-CU`, `-BR`).
- **Catalog import:** the printed catalog lives in `prisma/catalog/` (`categories.json`, `products.json`, `README.md`) — 8 categories and 54 products, all `price_on_request: true`. `prisma/import-catalog.ts` is idempotent, keyed on `sku` then `slug`, and a plain re-run refreshes only catalog fields — it never overwrites prices, stock, flags, or sales stats unless `--reset-pricing` is passed.
- **Product photos come from the PDF, and the mapping is hand-verified.** `prisma/catalog/images/` holds the 55 extracted JPEGs (tracked in git, because `uploads/` is gitignored); `import-catalog.ts` copies them into `uploads/catalog/` so a fresh server needs no extra step. `prisma/extract-catalog-images.ts` regenerates them from a PDF using `images.map.json` — that table is **manual on purpose**: inside the PDF the image objects are not in reading order (page 5 is reversed, pages 13/14/16 are shuffled), one product shows three tanks, two motors share a single photo, and several photos carry an smask that must be composited or the product renders on a black background. Sequential auto-matching produced wrong photos on ~8 products.
- **Wiping the catalog:** `prisma/reset-catalog.ts` deletes catalog rows plus everything referencing a product, and refuses to run while orders exist unless `--with-orders` is passed. MongoDB does not enforce foreign keys, so a deleted product leaves order/cart rows pointing at nothing, and reading them through `include: { product: true }` then throws. Users are never deleted — the last admin must survive, since only the seed can mint another.
- **Seeding:** `prisma/seed.ts` creates **only the admin user**. Catalog content belongs to the importer — a seed that also wrote products would undo an import on the next run.

### 6. Code Reusability & DTOs
- Services doing standard CRUD should inherit from [BaseService](file:///Users/omadbek/new-project/e-commerse/src/common/services/base.service.ts).
- Queries listing database entries should inherit from [PaginationQueryDto](file:///Users/omadbek/new-project/e-commerse/src/common/dto/pagination-query.dto.ts).

### 7. Payments — Payme (Merchant API)
- **Only provider:** Payme. Test cashbox: `https://test.paycom.uz`; production: `https://checkout.paycom.uz` (`PAYME_CHECKOUT_URL`). `CreateCheckoutDto` deliberately has **no `provider` field** — the service always builds a Payme link, so accepting one advertised a choice that was silently ignored. The *response* still carries `provider`. Adding Click later means re-adding an optional field, not a breaking change; clients that still send `provider` are unaffected because `ValidationPipe` runs with `whitelist: true` and strips it.
- **Two directions.** `POST /api/payments/checkout` (JWT) only **builds a cashier link** — it never marks anything paid. Payme's own server then calls `POST /api/payments/payme`, and the order becomes `CONFIRMED` inside `PerformTransaction`. The previous `payOrder` flipped payments to `SUCCESSFUL` on the spot, so orders counted as paid without any money moving.
- **Protocol rules** ([payme.service.ts](file:///home/baxa/coding/e-commerse-back/src/api/payments/payme/payme.service.ts)): every response carries `jsonrpc: "2.0"` and echoes the request `id`. HTTP status is **always 200** — the webhook needs an explicit `@HttpCode(HttpStatus.OK)`, since Nest answers `@Post()` with 201 by default and Payme treats anything but 200 as a failed call — failures go in the body's `error` object with a Payme error code and a `{ru, uz, en}` message. Auth is `Authorization: Basic base64("Paycom:<PAYME_KEY>")`, compared with `timingSafeEqual`. Amounts travel in **tiyin** (`toTiyin`/`toSom`). Every method is **idempotent** — Payme retries on network failure and the second call must return the first one's result.
- **Fiscal receipt (Uzbek OFD):** `CheckPerformTransaction` must return `result.detail` alongside `allow: true`, or Payme cannot fiscalize the payment. [payme.receipt.ts](file:///home/baxa/coding/e-commerse-back/src/api/payments/payme/payme.receipt.ts) builds it from the order's items: `code` (MXIK/IKPU), `package_code`, `vat_percent`, `units`, `count`, `discount`, and `price` **in tiyin**. Per-product values live on `Product` (`ikpu_code`, `package_code`, `vat_percent`, `units`); blanks fall back to the `PAYME_DEFAULT_*` env vars. `code` and `vat_percent` are **required** by Payme and always sent; `package_code` and `units` are omitted entirely when unset — sending `units: 0` or `package_code: ""` would be an invalid classifier code. With no IKPU anywhere, `PaymeService` throws `-31008` instead of letting Payme reject the receipt mid-payment, and `onModuleInit` warns at boot about any missing Payme config. Item titles use the **buyer's** language (`order.user.language`) — Payme's request carries no language.
- **Receipt total is verified up front.** Payme's rule is `AMOUNT == Σ((price × count) − discount)`. If the line items don't satisfy it we throw `-31001` during `CheckPerformTransaction`; Payme would otherwise reject the receipt at `PerformTransaction` — i.e. after the money moved. Product discounts are already baked into `price_at_purchase`, so item `discount` stays `0`. If a delivery fee is ever added to orders, it must become **its own line item** with its own IKPU, or the equality breaks.
- **Bypassing the wrapper:** the webhook is marked `@RawResponse()` so `ResponseInterceptor` leaves the JSON-RPC body untouched. Use that decorator for any endpoint whose response shape a third party dictates.
- **State machine:** `PaymeState` enum maps to protocol codes `CREATED=1`, `PERFORMED=2`, `CANCELLED=-1`, `CANCELLED_AFTER_PERFORM=-2`. A transaction expires after 12 hours; a `DELIVERED` order can no longer be cancelled (`-31007`).
- **`PaymeTransaction` is the protocol's source of truth, `Payment` is a mirror.** `Payment.order_id` is `@unique`, so one order has exactly one payment row — but Payme opens a *new* transaction for every attempt (a declined card means the customer retries). Reusing the single row erased the previous `payme_transaction_id`, so a later `CheckTransaction`/`CancelTransaction` on the old id answered `-31003` and `GetStatement` omitted it, breaking reconciliation. Every `CreateTransaction` now appends to `PaymeTransaction`; records are never reused. `Payment` still mirrors the *latest* attempt for the admin panel, and is only rewritten when `payme_transaction_id` matches the transaction being changed — otherwise cancelling an old attempt would clobber the live one.
- **An order is payable only while `PENDING`.** Any other status means the money already moved, so `CheckPerformTransaction` and `CreateTransaction` reject it with `-31052`. Without that check Payme opened the cashier window on a paid order and the customer could be charged twice.
- **A refund restores inventory.** `CANCELLED_AFTER_PERFORM` cancels the order *and* increments `stock` / decrements `sales_count` and `popularity_score`, exactly as `OrdersService` does — the stock was already decremented at checkout, so skipping this loses goods from the books. The payment becomes `REFUNDED`, not `FAILED`.
- **Docs:** the full integration walkthrough (what to request from Payme, cabinet setup, sandbox testing) is in [PAYME_INTEGRATION.md](file:///home/baxa/coding/e-commerse-back/PAYME_INTEGRATION.md). Two companions: [PAYME_MANAGER_REQUEST.md](file:///home/baxa/coding/e-commerse-back/PAYME_MANAGER_REQUEST.md) is the Russian-language technical letter **sent to the Payme manager** (endpoint, per-method request/response samples, the values to request back), and [prisma/catalog/IKPU.md](file:///home/baxa/coding/e-commerse-back/prisma/catalog/IKPU.md) is the per-category IKPU worksheet. `npm run db:check:ikpu` reports which products would fail fiscalization — it exits non-zero when a product has no IKPU **and** no `.env` fallback, since that combination breaks payment at `-31008`.

### 8. Localization (`?ln`)
- Supported languages: `uz`, `ru`, `en`. Default is `uz`.
- Fallback chain: `request.query.ln` $\rightarrow$ `request.user.language` (from the JWT) $\rightarrow$ `'uz'`. Resolved in one place — `resolveRequestLanguage()` in [request-language.ts](file:///home/baxa/coding/e-commerse-back/src/common/i18n/request-language.ts) — and used by `ResponseInterceptor`, `HttpExceptionFilter` and the `@CurrentLang()` decorator alike.
- Even on public routes, if an `Authorization` header is present, the language is parsed from the JWT payload. That parse is **unverified** and must only ever pick a language — never an authorization decision.
- Every response carries the resolved `language` field so clients can cache per language.
