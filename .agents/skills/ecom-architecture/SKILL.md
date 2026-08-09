---
name: ecom-architecture
description: Reference guide for the NestJS e-commerce architecture patterns including base service CRUD, stateless JWT and OTP verification, uploads serving, and dynamic translation fallback mapping.
license: MIT
metadata:
  author: system-architect
  version: "1.0.0"
---

# E-commerce Architecture Patterns

Use this skill as a reference when:
- Creating new API resources inside `src/api/`
- Extending the authentication, registration, or OTP flows
- Customizing query response signatures, localization fallbacks, or translations
- Working on shopping carts, orders, or checkout transaction pipelines

---

## Code Reference Patterns

### 1. Base Service CRUD Operations
All services implementing basic CRUD should extend [BaseService](file:///Users/omadbek/new-project/e-commerse/src/common/services/base.service.ts).
- Pass the Prisma client and the capitalized Prisma model name string (e.g. `'Product'`, `'Category'`, `'User'`) to `super`.
- Map flat DTO fields to nested Prisma relationship connections by overriding `create` or `update` as needed:
  ```typescript
  override async create(data: any) {
    const { category_id, ...rest } = data;
    return this.prisma.product.create({
      data: {
        ...rest,
        category: { connect: { id: category_id } }
      }
    });
  }
  ```

### 2. Localization Fallback Chain
Localization is resolved dynamically in [ResponseInterceptor](file:///Users/omadbek/new-project/e-commerse/src/common/interceptors/response.interceptor.ts) and [HttpExceptionFilter](file:///Users/omadbek/new-project/e-commerse/src/common/filters/http-exception.filter.ts):
- Check `request.query.ln` first.
- If missing, check `request.user?.language` (populated from JWT).
- On public routes, optionally parse the `Authorization` bearer token to read the user's language without calling passport guards.
- Default to `'uz'`.

### 3. Dynamic Content Translation
- Translate fields on output objects (e.g. `name`, `description`, `message`, `error`) by calling `translateObject(data, ln)` from [translations.ts](file:///Users/omadbek/new-project/e-commerse/src/common/i18n/translations.ts).
- Skip field translations if `ln === 'en'`.
- Skip recursively traversing `Date` object instances (to avoid converting them to empty `{}` objects).
- Remove `password` properties from all return objects for security compliance.

### 4. Stateless OTP Caching
- Signups generate a 6-digit random code and send it via [MailService](file:///Users/omadbek/new-project/e-commerse/src/common/services/mail.service.ts).
- Store registration OTPs in-memory inside `AuthService` with expiration timestamps.
- Validate OTP codes on verification.
- Cooldowns for code re-sending are validated via an in-memory timestamp cache.

### 5. Transactional Checkouts
Checkouts must be wrapped in a Prisma `$transaction` block to guarantee atomic consistency:
- Fetch and validate active cart items.
- Deduct stock levels per product using Prisma decrement operations.
- Create order and order items, saving historical purchase-time prices (`price_at_purchase`).
- Delete cart items to clear the customer's cart.
