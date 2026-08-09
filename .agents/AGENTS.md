# E-commerce Project Instructions & Rules

These rules govern the development of the E-commerce backend. All AI assistants must adhere to these rules at all times.

## Version & Stack Constraints

1. **Keep Prisma at v6:**
   - The database is MongoDB (`provider = "mongodb"`).
   - Prisma v7 does not support MongoDB (it has no MongoDB connector).
   - Therefore, the project MUST remain on Prisma v6. Never try to upgrade the project to Prisma 7.
   - For VS Code validation errors related to Prisma 7 syntax, make sure the setting `"prisma.pinToPrisma6": true` is enabled in `.vscode/settings.json`.

2. **Primary Key Constraints:**
   - All `id` fields in database models must be UUID strings mapped to `_id` in MongoDB:
     ```prisma
     id String @id @default(uuid()) @map("_id")
     ```
   - Relations linking to these IDs must be defined as simple `String` types, not `@db.ObjectId`.

3. **Field Naming Styles:**
   - All properties, relations, and columns inside `schema.prisma` must be in `snake_case` (e.g. `created_at`, `updated_at`, `category_id`, `is_archived`, `total_amount`).

## Design & Code Patterns

1. **Stateless Authentication & Tokens:**
   - Do NOT save access tokens, refresh tokens, or OTP verification codes to the database.
   - Maintain OTP verification codes and their 1-minute resend cooldown timestamps in-memory using Map caches inside the `AuthService`.
   - Access and refresh tokens must be signed as stateless JWT payloads.

2. **Security Compliance:**
   - Never leak passwords in response objects. The `translateObject` helper automatically deletes `password` keys from returned objects. Preserve this behavior.

3. **Localization Fallback:**
   - The active language `ln` (supporting `uz`, `ru`, `en`) must fall back to the user's preferred language (`user.language` parsed from the JWT payload) if the `?ln` query parameter is missing.
   - For public endpoints, decode the `Authorization` header optionally if present to read the user's preferred language.

4. **Resource Placement:**
   - All NestJS CLI generated resources (auth, users, products, categories, carts, orders, payments, uploads) must be created inside the `src/api/` folder using the `--no-spec` option.
