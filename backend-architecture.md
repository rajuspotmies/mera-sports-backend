# Mutiny Maker — Backend Architecture Document
## Node.js + PostgreSQL

> Generated: 2026-02-28
> Based on: Full frontend codebase analysis, src/core/api.ts (50+ endpoints), src/shared/types/campaign.ts, and full campaign lifecycle domain knowledge.

---

## TABLE OF CONTENTS

1. [Production Readiness Assessment](#1-production-readiness-assessment)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [API Design](#6-api-design)
7. [WebSocket Architecture](#7-websocket-architecture)
8. [File Storage](#8-file-storage)
9. [Payments Architecture](#9-payments-architecture)
10. [AI Integration (Strategist)](#10-ai-integration-strategist)
11. [Notification System](#11-notification-system)
12. [Security](#12-security)
13. [Error Handling](#13-error-handling)
14. [Environment Configuration](#14-environment-configuration)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Migration from Mock to Real API](#16-migration-from-mock-to-real-api)

---

## 1. PRODUCTION READINESS ASSESSMENT

### Frontend Score: 72 / 100

| Category | Score | Notes |
|----------|-------|-------|
| **Architecture** | 95/100 | Excellent module isolation, clean separation of concerns |
| **Type Safety** | 90/100 | Comprehensive TypeScript across all modules |
| **UI Completeness** | 80/100 | Major flows built; analytics/messages/settings are shells |
| **API Readiness** | 85/100 | All 50+ endpoints pre-defined in api.ts, types ready |
| **Error Handling** | 15/100 | No real error states — mock data never fails |
| **Loading States** | 10/100 | No skeletons, spinners, or suspense boundaries |
| **Authentication** | 20/100 | Zustand store exists but mock user hardcoded, no real session |
| **Real-time (WS)** | 40/100 | WebSocket manager built but never connected |
| **Testing** | 5/100 | Vitest + Testing Library installed, 1 example test |
| **Performance** | 50/100 | No code splitting, no lazy loading, single giant bundle |
| **Accessibility** | 55/100 | shadcn/ui provides baseline ARIA, not audited |
| **Security** | 0/100 | No real auth, no CSRF, no content security policy |

### What Must Be Done Before "Production" Frontend
- [ ] Create TanStack Query hooks for every module (useCampaigns, useInfluencers, etc.)
- [ ] Replace all `MOCK_DATA` imports with hooks
- [ ] Add loading skeletons on all list/detail pages
- [ ] Add error boundaries at module level
- [ ] Wire WebSocket connection in AppShell
- [ ] Implement token refresh logic in http.ts
- [ ] Add lazy loading for routes (`React.lazy + Suspense`)
- [ ] Write tests for critical flows (campaign creation, application accept)
- [ ] Add proper 401/403/404/500 handling UI

### Backend Gap: Everything
The backend does not exist yet. This document defines it.

---

## 2. TECHNOLOGY STACK

### Core Runtime
| Tool | Version | Reason |
|------|---------|--------|
| **Node.js** | 20 LTS | Stable, LTS support, native fetch |
| **TypeScript** | 5.5+ | Matches frontend version |
| **Express.js** | 4.x | Mature, minimal overhead, ecosystem |
| **PostgreSQL** | 16 | ACID compliance, JSONB for flexible fields, full-text search |
| **Redis** | 7.x | Session cache, pub/sub for WebSocket, job queues |

### Key Libraries
| Package | Purpose |
|---------|---------|
| `pg` + `drizzle-orm` | PostgreSQL client + type-safe ORM |
| `drizzle-kit` | Migrations |
| `jsonwebtoken` | JWT tokens |
| `bcryptjs` | Password hashing |
| `zod` | Request validation (mirrors frontend schemas) |
| `socket.io` | WebSocket server (matches frontend socket.io-client 4.8) |
| `bull` | Job queues (notifications, email) |
| `nodemailer` | Transactional email |
| `multer` | File upload middleware |
| `helmet` | Security headers |
| `cors` | CORS middleware |
| `express-rate-limit` | Rate limiting |
| `winston` | Structured logging |
| `openai` / `@anthropic-ai/sdk` / `@google/generative-ai` | AI Strategist + Smart Select (provider TBD — see Section 10) |

> Do NOT use Prisma — Drizzle ORM generates proper SQL, has zero runtime overhead, and produces TypeScript types that directly mirror the frontend's campaign.ts types.

---

## 3. PROJECT STRUCTURE

```
backend/
├── src/
│   ├── index.ts                    # App entry: starts HTTP + WebSocket servers
│   ├── app.ts                      # Express app setup (middleware, routes)
│   ├── socket.ts                   # Socket.io server setup
│   │
│   ├── config/
│   │   ├── env.ts                  # Zod-validated env vars
│   │   ├── database.ts             # PostgreSQL connection pool
│   │   ├── redis.ts                # Redis client
│   │   └── storage.ts              # S3 client config
│   │
│   ├── db/
│   │   ├── schema/                 # Drizzle table definitions (mirrors frontend types)
│   │   │   ├── users.ts
│   │   │   ├── campaigns.ts
│   │   │   ├── influencers.ts
│   │   │   ├── campaign_influencers.ts
│   │   │   ├── negotiations.ts
│   │   │   ├── scripts.ts
│   │   │   ├── submissions.ts
│   │   │   ├── conversations.ts
│   │   │   ├── messages.ts
│   │   │   ├── notifications.ts
│   │   │   └── payments.ts
│   │   ├── migrations/             # Drizzle generated SQL migrations
│   │   ├── seed.ts                 # Dev seed (maps from src/mocks/data.ts)
│   │   └── index.ts                # Drizzle instance export
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.router.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.schema.ts      # Zod request validation
│   │   │
│   │   ├── campaigns/
│   │   │   ├── campaigns.router.ts
│   │   │   ├── campaigns.service.ts
│   │   │   ├── campaigns.controller.ts
│   │   │   └── campaigns.schema.ts
│   │   │
│   │   ├── applications/           # Within campaign context
│   │   │   ├── applications.router.ts
│   │   │   ├── applications.service.ts
│   │   │   └── applications.controller.ts
│   │   │
│   │   ├── negotiation/
│   │   │   ├── negotiation.router.ts
│   │   │   ├── negotiation.service.ts
│   │   │   └── negotiation.controller.ts
│   │   │
│   │   ├── payments/
│   │   │   ├── payments.router.ts
│   │   │   ├── payments.service.ts
│   │   │   ├── payments.controller.ts
│   │   │   └── webhooks.ts         # Payment provider webhooks
│   │   │
│   │   ├── scripts/
│   │   │   ├── scripts.router.ts
│   │   │   ├── scripts.service.ts
│   │   │   └── scripts.controller.ts
│   │   │
│   │   ├── submissions/
│   │   │   ├── submissions.router.ts
│   │   │   ├── submissions.service.ts
│   │   │   └── submissions.controller.ts
│   │   │
│   │   ├── influencers/
│   │   │   ├── influencers.router.ts
│   │   │   ├── influencers.service.ts
│   │   │   └── influencers.controller.ts
│   │   │
│   │   ├── messages/
│   │   │   ├── messages.router.ts
│   │   │   ├── messages.service.ts
│   │   │   └── messages.controller.ts
│   │   │
│   │   ├── analytics/
│   │   │   ├── analytics.router.ts
│   │   │   ├── analytics.service.ts
│   │   │   └── analytics.controller.ts
│   │   │
│   │   ├── notifications/
│   │   │   ├── notifications.router.ts
│   │   │   ├── notifications.service.ts
│   │   │   └── notifications.controller.ts
│   │   │
│   │   ├── brand/
│   │   │   ├── brand.router.ts
│   │   │   ├── brand.service.ts
│   │   │   └── brand.controller.ts
│   │   │
│   │   └── ai/
│   │       ├── ai.router.ts
│   │       ├── ai.service.ts        # OpenAI wrapper for AI Strategist
│   │       └── ai.controller.ts
│   │
│   ├── middleware/
│   │   ├── authenticate.ts         # JWT verify middleware
│   │   ├── authorize.ts            # Role-based access (brand_owner, influencer, admin)
│   │   ├── validate.ts             # Zod schema validation middleware
│   │   ├── upload.ts               # Multer + S3 upload middleware
│   │   ├── rateLimiter.ts          # Per-route rate limits
│   │   └── errorHandler.ts         # Global error handler
│   │
│   ├── shared/
│   │   ├── types/
│   │   │   ├── campaign.ts         # Mirror of frontend shared/types/campaign.ts
│   │   │   └── api.ts              # Request/Response types
│   │   ├── errors/
│   │   │   ├── AppError.ts         # Base error class
│   │   │   ├── HttpError.ts        # HTTP errors (400, 401, 403, 404, 409, 500)
│   │   │   └── index.ts
│   │   └── utils/
│   │       ├── pagination.ts
│   │       ├── slugify.ts
│   │       └── dates.ts
│   │
│   └── jobs/
│       ├── queue.ts                # Bull queue setup
│       ├── processors/
│       │   ├── notification.processor.ts
│       │   ├── email.processor.ts
│       │   └── analytics.processor.ts
│       └── index.ts
│
├── drizzle.config.ts
├── package.json
├── tsconfig.json
├── .env.example
└── Dockerfile
```

---

## 4. DATABASE SCHEMA

### Entity Relationship Overview

```
brands (users with role=brand_owner)
  └── campaigns (1 brand → many campaigns)
        └── campaign_influencers (N:M bridge table — core pipeline)
              ├── negotiations (1:many per campaign_influencer)
              ├── script_versions (1:many per campaign_influencer)
              ├── work_submissions (1:many per campaign_influencer)
              └── payments (1:1 per campaign_influencer)

influencers (users with role=influencer)
  └── influencer_profiles (extended profile)

conversations
  └── messages (1 conversation → many messages)

notifications (1 user → many notifications)
```

---

### 4.1 users

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL CHECK (role IN ('brand_owner', 'influencer', 'admin')),
  avatar_url    VARCHAR(500),
  is_verified   BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

---

### 4.2 brand_profiles

```sql
CREATE TABLE brand_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_name        VARCHAR(255) NOT NULL,
  brand_logo_url    VARCHAR(500),
  industry          VARCHAR(100),
  website           VARCHAR(255),
  description       TEXT,
  verified          BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_brand_profiles_user ON brand_profiles(user_id);
```

---

### 4.3 influencer_profiles

```sql
CREATE TABLE influencer_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handle          VARCHAR(100),
  bio             TEXT,
  location        VARCHAR(255),
  niches          TEXT[],                           -- e.g. ['Beauty', 'Skincare']
  tier            VARCHAR(20) CHECK (tier IN ('nano', 'micro', 'mid', 'macro', 'mega')),
  follower_count  INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2),
  platforms       JSONB DEFAULT '[]',               -- [{ platform, handle, followers }]
  rate_card       JSONB DEFAULT '{}',               -- { instagram_reel: 5000, ... }
  portfolio_urls  TEXT[],
  is_verified     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_influencer_profiles_user ON influencer_profiles(user_id);
CREATE INDEX idx_influencer_profiles_tier ON influencer_profiles(tier);
CREATE INDEX idx_influencer_profiles_niches ON influencer_profiles USING GIN(niches);
```

---

### 4.4 campaigns

```sql
CREATE TABLE campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  name                  VARCHAR(255) NOT NULL,
  type                  VARCHAR(20) NOT NULL CHECK (type IN ('influencer', 'ugc', 'meme', 'twitter')),
  visibility            VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  objective             VARCHAR(100),
  status                VARCHAR(30) NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'active', 'script', 'work', 'completed', 'closed', 'withdrawn')),

  -- Budget
  budget_mode           VARCHAR(20) NOT NULL CHECK (budget_mode IN ('paid', 'product', 'paid_product')),
  budget_tier_pricing   JSONB NOT NULL DEFAULT '[]',  -- TierPricing[]
  budget_total          DECIMAL(12,2),
  platform_fee_percent  DECIMAL(5,2) DEFAULT 10.0,

  -- Campaign details
  location              VARCHAR(255),
  niches                TEXT[],
  creator_sizes         TEXT[],                       -- CreatorTier[]
  creators_invited      INTEGER DEFAULT 0,
  creators_accepted     INTEGER DEFAULT 0,
  applications_count    INTEGER DEFAULT 0,
  pending_scripts       INTEGER DEFAULT 0,
  pending_submissions   INTEGER DEFAULT 0,
  progress              INTEGER DEFAULT 0,

  -- Creative settings
  brief                 TEXT,
  dos                   TEXT[],
  donts                 TEXT[],
  reference_urls        TEXT[],
  hashtags              TEXT[],
  deliverables          JSONB DEFAULT '[]',
  proof_of_work_req     BOOLEAN DEFAULT false,

  -- Media
  thumbnail_url         VARCHAR(500),

  -- Lifecycle
  deadline              TIMESTAMPTZ,
  launched_at           TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_brand ON campaigns(brand_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_type ON campaigns(type);
CREATE INDEX idx_campaigns_niches ON campaigns USING GIN(niches);
```

---

### 4.5 campaign_influencers (Core Pipeline Table)

```sql
CREATE TABLE campaign_influencers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  influencer_id     UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
  origin            VARCHAR(30) NOT NULL CHECK (origin IN ('brand_invite', 'influencer_application')),
  status            VARCHAR(30) NOT NULL DEFAULT 'invited'
                      CHECK (status IN (
                        'invited', 'applied', 'accepted',
                        'payment_pending', 'paid',
                        'script_pending', 'script_review',
                        'work_pending', 'work_review',
                        'completed', 'rejected', 'withdrawn'
                      )),
  chat_enabled      BOOLEAN DEFAULT false,

  -- Financial
  tier_rate         DECIMAL(12,2),
  agreed_budget     DECIMAL(12,2),
  platform_fee      DECIMAL(12,2),
  first_payment     DECIMAL(12,2),
  final_payment     DECIMAL(12,2),

  -- Application data
  application_note  TEXT,
  applied_at        TIMESTAMPTZ,

  -- Lifecycle timestamps
  accepted_at       TIMESTAMPTZ,
  connected_at      TIMESTAMPTZ DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (campaign_id, influencer_id)
);

CREATE INDEX idx_ci_campaign ON campaign_influencers(campaign_id);
CREATE INDEX idx_ci_influencer ON campaign_influencers(influencer_id);
CREATE INDEX idx_ci_status ON campaign_influencers(status);
```

---

### 4.6 negotiations

```sql
CREATE TABLE negotiations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_influencer_id UUID NOT NULL REFERENCES campaign_influencers(id) ON DELETE CASCADE,
  party                 VARCHAR(20) NOT NULL CHECK (party IN ('brand', 'influencer')),
  amount                DECIMAL(12,2) NOT NULL,
  note                  TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_negotiations_ci ON negotiations(campaign_influencer_id);
CREATE INDEX idx_negotiations_created ON negotiations(created_at);
```

---

### 4.7 script_versions

```sql
CREATE TABLE script_versions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_influencer_id UUID NOT NULL REFERENCES campaign_influencers(id) ON DELETE CASCADE,
  version_number        INTEGER NOT NULL DEFAULT 1,
  file_url              VARCHAR(500) NOT NULL,
  file_name             VARCHAR(255) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'revision_requested')),
  review_note           TEXT,
  submitted_at          TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           UUID REFERENCES users(id)
);

CREATE INDEX idx_scripts_ci ON script_versions(campaign_influencer_id);
```

---

### 4.8 work_submissions

```sql
CREATE TABLE work_submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_influencer_id UUID NOT NULL REFERENCES campaign_influencers(id) ON DELETE CASCADE,
  type                  VARCHAR(50) NOT NULL,         -- 'instagram_reel', 'youtube_video', etc.
  url                   VARCHAR(500) NOT NULL,         -- Live post URL
  file_name             VARCHAR(255),
  proof_of_work_url     VARCHAR(500),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note           TEXT,
  submitted_at          TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           UUID REFERENCES users(id)
);

CREATE INDEX idx_submissions_ci ON work_submissions(campaign_influencer_id);
```

---

### 4.9 payments

```sql
CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_influencer_id UUID NOT NULL REFERENCES campaign_influencers(id) ON DELETE CASCADE,
  status                VARCHAR(30) NOT NULL DEFAULT 'pending_first'
                          CHECK (status IN ('pending_first', 'first_paid', 'pending_final', 'completed', 'refunded')),

  -- First payment (50% upfront)
  first_amount          DECIMAL(12,2),
  first_payment_id      VARCHAR(255),                 -- payment gateway transaction ID
  first_paid_at         TIMESTAMPTZ,

  -- Final payment (50% on completion)
  final_amount          DECIMAL(12,2),
  final_payment_id      VARCHAR(255),
  final_paid_at         TIMESTAMPTZ,

  -- Refund
  refund_amount         DECIMAL(12,2),
  refund_reason         TEXT,
  refunded_at           TIMESTAMPTZ,

  -- Currency
  currency              VARCHAR(10) DEFAULT 'INR',
  gateway               VARCHAR(50),                  -- 'razorpay' | 'stripe'

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_ci ON payments(campaign_influencer_id);
CREATE INDEX idx_payments_status ON payments(status);
```

---

### 4.10 conversations

```sql
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  brand_id        UUID NOT NULL REFERENCES brand_profiles(id),
  influencer_id   UUID NOT NULL REFERENCES influencer_profiles(id),
  status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'archived')),
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  brand_unread    INTEGER DEFAULT 0,
  influencer_unread INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (campaign_id, influencer_id)
);

CREATE INDEX idx_conversations_campaign ON conversations(campaign_id);
CREATE INDEX idx_conversations_brand ON conversations(brand_id);
CREATE INDEX idx_conversations_influencer ON conversations(influencer_id);
```

---

### 4.11 messages

```sql
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  sender_role     VARCHAR(20) NOT NULL CHECK (sender_role IN ('brand', 'influencer', 'system')),
  content         TEXT NOT NULL,
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
```

---

### 4.12 notifications

```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(30) NOT NULL
                    CHECK (type IN ('application', 'script', 'submission', 'negotiation', 'payment', 'chat', 'system')),
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  campaign_id     UUID REFERENCES campaigns(id),
  campaign_name   VARCHAR(255),
  influencer_id   UUID REFERENCES influencer_profiles(id),
  influencer_name VARCHAR(255),
  action_url      VARCHAR(500),
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
```

---

### 4.13 analytics_snapshots (Denormalized for fast reads)

```sql
CREATE TABLE analytics_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  total_likes     BIGINT DEFAULT 0,
  total_comments  BIGINT DEFAULT 0,
  total_shares    BIGINT DEFAULT 0,
  total_reach     BIGINT DEFAULT 0,
  engagement_rate DECIMAL(5,2),
  views           BIGINT DEFAULT 0,
  clicks          BIGINT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (campaign_id, snapshot_date)
);

CREATE INDEX idx_analytics_campaign ON analytics_snapshots(campaign_id);
```

---

### 4.14 refresh_tokens

```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
```

---

## 5. AUTHENTICATION & AUTHORIZATION

### Token Strategy

```
Access Token:  JWT, short-lived (15 minutes)
Refresh Token: Opaque random token (stored hashed in DB), 30 days
```

### JWT Payload

```typescript
interface JWTPayload {
  sub: string;         // user UUID
  role: 'brand_owner' | 'influencer' | 'admin';
  brandId?: string;    // brand_profile UUID (brand_owner only)
  influencerId?: string; // influencer_profile UUID (influencer only)
  iat: number;
  exp: number;
}
```

### Auth Endpoints (maps to api.ts)

```
POST /api/v1/auth/register
  body: { email, password, name, role }
  → Creates user + brand_profile or influencer_profile
  → Returns: { accessToken, refreshToken, user }

POST /api/v1/auth/login
  body: { email, password }
  → Returns: { accessToken, refreshToken, user }

POST /api/v1/auth/refresh
  body: { refreshToken }
  → Returns: { accessToken, refreshToken }

POST /api/v1/auth/logout
  body: { refreshToken }
  → Deletes refresh token from DB

GET  /api/v1/auth/me
  headers: Authorization: Bearer <accessToken>
  → Returns: { user }
```

### Middleware Chain

```typescript
// authenticate.ts — verifies JWT
export const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new HttpError(401, 'Unauthorized');
  const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
  req.user = payload;
  next();
};

// authorize.ts — checks role
export const authorize = (...roles: string[]) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'Forbidden');
  next();
};

// Example usage:
router.get('/campaigns', authenticate, authorize('brand_owner'), getCampaigns);
```

---

## 6. API DESIGN

### Base URL: `/api/v1`

### Response Envelope

All responses follow this shape:

```typescript
// Success
{ success: true, data: T, meta?: { page, limit, total } }

// Error
{ success: false, error: { code: string, message: string, details?: any } }
```

---

### 6.1 Auth Routes (No Authentication Required)

```
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

---

### 6.2 Brand Profile Routes

```
GET  /brand/profile          → Get own brand profile
PUT  /brand/profile          → Update brand profile
POST /brand/profile/avatar   → Upload brand logo (multipart)
```

---

### 6.3 Campaign Routes

```
GET    /campaigns                     → List all campaigns for brand (with filters: status, type, visibility)
POST   /campaigns                     → Create new campaign (status: 'draft')
GET    /campaigns/:id                 → Get campaign detail
PUT    /campaigns/:id                 → Update campaign
DELETE /campaigns/:id                 → Soft delete campaign
POST   /campaigns/:id/launch          → Change status draft → active
POST   /campaigns/:id/close           → Change status → closed
```

**Query params for GET /campaigns:**
- `status` — filter by CampaignStatus
- `type` — filter by CampaignType
- `visibility` — public | private
- `page`, `limit` — pagination
- `sort` — createdAt, deadline, progress

---

### 6.4 Application Routes

```
GET  /campaigns/:campaignId/applications
  → List all influencers who applied/were invited
  → Optionally filter by status

POST /campaigns/:campaignId/applications/:appId/approve
  → Sets campaign_influencer.status → 'accepted'
  → Creates conversation
  → Enables chat
  → Emits WS: APPLICATION_APPROVED

POST /campaigns/:campaignId/applications/:appId/reject
  → Sets campaign_influencer.status → 'rejected'
  → Emits WS: APPLICATION_REJECTED
```

---

### 6.5 Negotiation Routes

```
GET  /campaigns/:campaignId/negotiation/:influencerId
  → Get full negotiation history (list of NegotiationEntry)

POST /campaigns/:campaignId/negotiation/:influencerId/accept
  body: { amount }
  → Finalizes negotiation
  → Sets campaign_influencer.agreed_budget
  → Sets campaign_influencer.status → 'payment_pending'
  → Emits WS: NEGOTIATION_ACCEPTED

POST /campaigns/:campaignId/negotiation/:influencerId/counter
  body: { amount, note }
  → Adds negotiation row (party: 'brand')
  → Sets campaign_influencer.status → 'negotiating'
  → Emits WS: NEGOTIATION_UPDATE
```

---

### 6.6 Payment Routes

```
POST /campaigns/:campaignId/payment
  body: { influencerId, type: 'first' | 'final' }
  → Initiates payment via gateway (Razorpay/Stripe)
  → Returns: { orderId, amount, currency, gatewayKey }
  → Status remains pending until webhook confirms

GET  /campaigns/:campaignId/payment/status
  → Returns current PaymentStatus for all influencers in campaign

POST /payments/webhook
  → Razorpay/Stripe webhook
  → Verifies signature
  → Updates payment.status
  → Emits WS: PAYMENT_STATUS
  → Sends email notification
```

---

### 6.7 Script Routes

```
GET  /campaigns/:campaignId/scripts
  → List all script_versions for all influencers in campaign

POST /campaigns/:campaignId/scripts/:scriptId/approve
  → Sets script_version.status → 'approved'
  → Sets campaign_influencer.status → 'work_pending'
  → Emits WS: SCRIPT_REVIEWED
  → Sends notification

POST /campaigns/:campaignId/scripts/:scriptId/revise
  body: { reviewNote }
  → Sets script_version.status → 'revision_requested'
  → Emits WS: SCRIPT_REVIEWED
```

---

### 6.8 Submissions Routes

```
GET  /campaigns/:campaignId/submissions
  → List all work_submissions for campaign

POST /campaigns/:campaignId/submissions/:subId/approve
  → Sets work_submission.status → 'approved'
  → Sets campaign_influencer.status → 'completed'
  → Emits WS: SUBMISSION_REVIEWED

POST /campaigns/:campaignId/submissions/:subId/reject
  body: { reviewNote }
  → Sets work_submission.status → 'rejected'
  → Emits WS: SUBMISSION_REVIEWED
```

---

### 6.9 Discover / Influencer Routes

```
GET  /influencers/search
  Query params:
    - q (text search on name, handle)
    - niche[] (array filter)
    - tier[] (nano, micro, mid, macro, mega)
    - location
    - minFollowers, maxFollowers
    - minEngagement
    - page, limit

GET  /influencers/:id
  → Full influencer profile with portfolio

POST /influencers/invite
  body: { influencerId, campaignId, message? }
  → Creates campaign_influencer (origin: 'brand_invite', status: 'invited')
  → Sends notification to influencer
  → Emits WS: INVITATION_SENT

POST /influencers/bulk-invite
  body: { influencerIds[], campaignId, message? }
  → Bulk creates campaign_influencers
```

---

### 6.10 Messages Routes

```
GET  /messages
  → List all conversations for current brand (with unread counts)

GET  /messages/:conversationId
  → Get conversation + messages (paginated, newest last)
  Query params: page, limit

POST /messages/:conversationId
  body: { content }
  → Creates message
  → Updates conversation.last_message + last_message_at
  → Emits WS: CHAT_MESSAGE
```

---

### 6.11 Analytics Routes

```
GET  /analytics/overview
  → Aggregated stats: totalCampaigns, totalInfluencers, totalReach, totalSpend
  → Month-over-month trends (for charts)
  → Top performing campaigns

GET  /analytics/campaigns/:campaignId
  → Per-campaign analytics: reach, engagement, content breakdown
  → Timeline of analytics_snapshots

GET  /analytics/content
  → Content performance breakdown by type and niche
```

---

### 6.12 Notification Routes

```
GET  /notifications
  Query: page, limit, unreadOnly
  → List notifications for current user

POST /notifications/:id/read
  → Mark single notification as read

POST /notifications/read-all
  → Mark all as read
```

---

### 6.13 AI Routes

```
POST /ai/strategist
  body: { campaignId?, messages: [{role, content}] }
  → Streams OpenAI response (SSE)
  → Has access to campaign context if campaignId provided
  → System prompt includes brand niche, campaign data
```

---

## 7. WEBSOCKET ARCHITECTURE

### Server Setup

```typescript
// socket.ts
import { Server } from 'socket.io';
import { authenticate } from './middleware/authenticate';

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL },
});

// Authenticate every WS connection
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    socket.data.user = jwt.verify(token, env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.data.user.sub}`);

  // Join user's personal room for notifications
  socket.join(`user:${socket.data.user.sub}`);

  socket.on('JOIN_CAMPAIGN', (campaignId) => {
    socket.join(`campaign:${campaignId}`);
  });

  socket.on('LEAVE_CAMPAIGN', (campaignId) => {
    socket.leave(`campaign:${campaignId}`);
  });

  socket.on('SEND_MESSAGE', async (data) => {
    // Save to DB + emit to conversation room
  });

  socket.on('MARK_READ', async (conversationId) => {
    // Update unread count
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.data.user.sub}`);
  });
});
```

### Emitting Events from Services

```typescript
// Emit to all members of a campaign
io.to(`campaign:${campaignId}`).emit('CAMPAIGN_UPDATE', payload);

// Emit to specific user (notifications)
io.to(`user:${userId}`).emit('NOTIFICATION', notification);

// Emit to conversation participants
io.to(`campaign:${campaignId}`).emit('CHAT_MESSAGE', message);
```

### Event Registry (matches src/core/api.ts WS_EVENTS)

| Event | Direction | Payload |
|-------|-----------|---------|
| `NOTIFICATION` | Server → Client | Notification object |
| `CAMPAIGN_UPDATE` | Server → Client | `{ campaignId, status, field }` |
| `CHAT_MESSAGE` | Bidirectional | Message object |
| `APPLICATION_RECEIVED` | Server → Client | `{ campaignId, influencer }` |
| `SCRIPT_SUBMITTED` | Server → Client | `{ campaignId, influencerId, scriptId }` |
| `WORK_SUBMITTED` | Server → Client | `{ campaignId, influencerId, submissionId }` |
| `NEGOTIATION_UPDATE` | Server → Client | `{ campaignId, influencerId, entry }` |
| `PAYMENT_STATUS` | Server → Client | `{ campaignId, influencerId, status }` |
| `JOIN_CAMPAIGN` | Client → Server | `campaignId` |
| `LEAVE_CAMPAIGN` | Client → Server | `campaignId` |
| `SEND_MESSAGE` | Client → Server | `{ conversationId, content }` |
| `MARK_READ` | Client → Server | `conversationId` |

### Redis Pub/Sub for Horizontal Scaling

```typescript
// When running multiple Node.js instances:
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
// Now all instances share the same Socket.io rooms via Redis
```

---

## 8. FILE STORAGE

### Strategy: Railway Volume (Persistent Disk)

Railway provides **persistent volumes** — a mounted disk attached to your service. Files are stored on the local filesystem and served via Express. No external object storage service needed.

> Railway Volume = persistent block storage that survives deploys and restarts. It mounts at a path like `/data` inside your container.

**What gets stored:**
- Brand logos / avatars
- Script files (PDF, DOCX)
- Work submission proofs (images, video thumbnails)
- MOU documents

### Upload Flow

```
Client → POST /uploads/[type] (multipart/form-data)
              ↓
         Multer middleware (validates file type + size)
              ↓
         Save to /data/uploads/[folder]/[timestamp]-[filename]
              ↓
         Return: { url: '/files/[folder]/[filename]' }
              ↓
         Express static serves /data/uploads at /files
```

### Railway Volume Setup

In your Railway service settings, mount a volume:
```
Mount path: /data
```

Then in `config/storage.ts`:
```typescript
import path from 'path';
import fs from 'fs';

export const UPLOAD_ROOT = process.env.UPLOAD_PATH || '/data/uploads';

// Ensure directories exist on startup
export function ensureUploadDirs() {
  const dirs = ['avatars', 'scripts', 'submissions', 'logos'];
  dirs.forEach(dir => fs.mkdirSync(path.join(UPLOAD_ROOT, dir), { recursive: true }));
}
```

### Multer Config

```typescript
// middleware/upload.ts
import multer from 'multer';
import path from 'path';
import { UPLOAD_ROOT } from '@/config/storage';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.uploadFolder ?? 'misc';  // set by route middleware
    cb(null, path.join(UPLOAD_ROOT, folder));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ALLOWED_TYPES[req.uploadFolder ?? 'misc'] ?? [];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new AppError('INVALID_FILE_TYPE', `File type not allowed: ${file.mimetype}`, 400));
  },
});

const ALLOWED_TYPES: Record<string, string[]> = {
  avatars:     ['image/png', 'image/jpeg', 'image/webp'],
  logos:       ['image/png', 'image/jpeg', 'image/svg+xml'],
  scripts:     ['application/pdf', 'application/msword',
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                 'text/plain'],
  submissions: ['image/png', 'image/jpeg', 'video/mp4', 'video/quicktime'],
};
```

### File Serving

```typescript
// In app.ts — serve uploads as static files
import express from 'express';
import { UPLOAD_ROOT } from '@/config/storage';

app.use('/files', express.static(UPLOAD_ROOT, {
  maxAge: '7d',      // cache in browser
  etag: true,
}));
```

Files will be accessible at:
```
https://your-api.railway.app/files/avatars/1709123456789-abc123.jpg
https://your-api.railway.app/files/scripts/1709123456789-def456.pdf
```

### File Validation Rules

| Upload Type | Allowed Formats | Max Size |
|-------------|----------------|---------|
| Brand logo | PNG, JPG, SVG | 2MB |
| Avatar | PNG, JPG, WebP | 2MB |
| Script | PDF, DOCX, TXT | 10MB |
| Work submission proof | PNG, JPG, MP4, MOV | 50MB |

### Railway Volume — Important Limitations

| Concern | Detail |
|---------|--------|
| **Scaling** | Volume is attached to ONE service instance. If you horizontally scale, only one instance has the disk. Fine for early stage; migrate to S3 if you scale to multiple instances. |
| **Backups** | Railway does not auto-backup volumes. Set up a cron job to sync `/data` to an external bucket periodically. |
| **CDN** | No CDN in front of Railway static files. For production performance on media-heavy content, add Cloudflare proxy (free tier) in front of your Railway domain. |
| **Max size** | Railway volumes go up to 100GB on Pro plan. More than enough for scripts/images at scale. |

---

## 9. PAYMENTS ARCHITECTURE

### Payment Gateway: Razorpay (India-first, matches INR currency)

Two-step payment flow matches `PaymentStatus` enum:

```
Step 1: First Payment (50% upfront)
  Brand initiates → Gateway creates order → Brand pays
  Webhook confirms → DB: first_paid → campaign_influencer: paid
  → Campaign advances to script phase

Step 2: Final Payment (50% on completion)
  Admin releases after work approval
  Gateway creates order → Admin/brand confirms
  Webhook confirms → DB: completed
```

### Payment Service

```typescript
// payments.service.ts
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export async function initiateFirstPayment(campaignInfluencerId: string) {
  const ci = await getCampaignInfluencer(campaignInfluencerId);

  // Block if negotiation not resolved
  if (ci.status !== 'payment_pending') {
    throw new AppError('NEGOTIATION_REQUIRED', 'Negotiation must be resolved before payment');
  }

  const order = await razorpay.orders.create({
    amount: ci.first_payment * 100,  // Razorpay expects paise
    currency: 'INR',
    receipt: `first_${campaignInfluencerId}`,
    notes: { campaignInfluencerId, type: 'first' },
  });

  return { orderId: order.id, amount: order.amount, currency: order.currency };
}

export async function handleWebhook(payload: RazorpayWebhookPayload, signature: string) {
  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  if (signature !== expectedSignature) throw new AppError('INVALID_SIGNATURE', 'Webhook signature mismatch');

  if (payload.event === 'payment.captured') {
    const { campaignInfluencerId, type } = payload.payload.payment.entity.notes;
    await updatePaymentStatus(campaignInfluencerId, type);  // Updates DB + emits WS
  }
}
```

---

## 10. AI INTEGRATION (STRATEGIST + SMART SELECT)

The `AIStrategistChat` component (26KB) and Smart Select feature in the campaigns module call the AI layer.

### Provider Decision: TBD

The AI layer is built as an **abstraction** so you can swap providers (Claude, GPT-4o, Gemini) by changing one env var and one adapter, with zero changes to the route or frontend.

**Two AI features to support:**

| Feature | Description | Latency need |
|---------|-------------|-------------|
| **AI Strategist** | Conversational chat — strategy, brief writing, campaign analysis | Streaming (SSE) |
| **Smart Select** | One-shot: auto-suggest best influencers for a campaign based on niche, budget, tier | Fast, non-streaming |

---

### Provider Adapter Pattern

```typescript
// modules/ai/providers/types.ts
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIProvider {
  streamChat(messages: AIMessage[], systemPrompt: string, res: Response): Promise<void>;
  complete(prompt: string): Promise<string>;  // for Smart Select (non-streaming)
}
```

```typescript
// modules/ai/providers/openai.provider.ts
import OpenAI from 'openai';
export class OpenAIProvider implements AIProvider {
  private client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  async streamChat(messages: AIMessage[], systemPrompt: string, res: Response) {
    const stream = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }

  async complete(prompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content ?? '';
  }
}
```

```typescript
// modules/ai/providers/anthropic.provider.ts
import Anthropic from '@anthropic-ai/sdk';
export class AnthropicProvider implements AIProvider {
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  async streamChat(messages: AIMessage[], systemPrompt: string, res: Response) {
    const stream = await this.client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ content: chunk.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }

  async complete(prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content[0].type === 'text' ? res.content[0].text : '';
  }
}
```

```typescript
// modules/ai/providers/index.ts — swap by env var, zero other changes
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import type { AIProvider } from './types';

export function getAIProvider(): AIProvider {
  switch (env.AI_PROVIDER) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai':
    default:          return new OpenAIProvider();
  }
}
```

---

### AI Strategist Service

```typescript
// modules/ai/ai.service.ts
const STRATEGIST_SYSTEM_PROMPT = `You are Mutiny AI Strategist, an expert influencer
marketing advisor for brands using the Mutiny Maker platform. You help brands:
- Define campaign objectives and strategy
- Choose the right creator tiers and budget allocation
- Craft compelling campaign briefs
- Analyze campaign performance and suggest optimizations
- Negotiate and communicate with influencers

Brand: {brandName} | Industry: {industry}
Active campaigns: {campaignSummary}`;

export async function streamStrategistResponse(
  messages: AIMessage[],
  brandContext: BrandContext,
  res: Response
) {
  const provider = getAIProvider();
  const systemPrompt = buildSystemPrompt(STRATEGIST_SYSTEM_PROMPT, brandContext);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  await provider.streamChat(messages, systemPrompt, res);
}
```

---

### Smart Select Service

```typescript
// Smart Select: given a campaign, return ranked influencer suggestions
export async function smartSelectInfluencers(
  campaignId: string,
  candidateInfluencers: InfluencerProfile[]
): Promise<SmartSelectResult[]> {
  const campaign = await getCampaignById(campaignId);
  const provider = getAIProvider();

  const prompt = buildSmartSelectPrompt(campaign, candidateInfluencers);
  const raw = await provider.complete(prompt);

  // Parse structured JSON response from AI
  return parseSmartSelectResponse(raw);
}

function buildSmartSelectPrompt(campaign: Campaign, influencers: InfluencerProfile[]) {
  return `
You are an influencer selection expert. Given this campaign and list of influencers,
rank the top 10 best matches and explain why.

Campaign:
- Name: ${campaign.name}
- Niche: ${campaign.niches.join(', ')}
- Budget mode: ${campaign.budget_mode}
- Budget per tier: ${JSON.stringify(campaign.budget_tier_pricing)}
- Creator sizes wanted: ${campaign.creator_sizes.join(', ')}
- Objective: ${campaign.objective}

Influencers (JSON array):
${JSON.stringify(influencers.slice(0, 50))}

Respond with a JSON array:
[{ "influencerId": "...", "score": 0-100, "reason": "..." }]

Only respond with JSON, no other text.`;
}
```

---

## 11. NOTIFICATION SYSTEM

### In-App Notifications (Real-time via WebSocket)

```typescript
// notifications.service.ts
export async function createNotification(data: CreateNotificationDTO) {
  // 1. Save to DB
  const notification = await db.insert(notifications).values(data).returning();

  // 2. Emit via WebSocket to user's room
  io.to(`user:${data.userId}`).emit('NOTIFICATION', notification[0]);

  // 3. Queue email (non-blocking)
  await notificationQueue.add('send-email', {
    userId: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
  });

  return notification[0];
}
```

### Notification Triggers

| Trigger | Recipient | Type |
|---------|-----------|------|
| Influencer applies to campaign | Brand | `application` |
| Brand approves application | Influencer | `system` |
| Script submitted by influencer | Brand | `script` |
| Script approved/revision requested | Influencer | `script` |
| Work submitted | Brand | `submission` |
| Work approved/rejected | Influencer | `submission` |
| Negotiation counter received | Brand/Influencer | `negotiation` |
| Payment confirmed | Brand + Influencer | `payment` |
| New chat message | Recipient | `chat` |

### Email Queue (Bull)

```typescript
// jobs/processors/email.processor.ts
import { Job } from 'bull';
import nodemailer from 'nodemailer';

export async function processEmailJob(job: Job) {
  const { userId, type, title, message } = job.data;
  const user = await getUserById(userId);

  await transporter.sendMail({
    from: '"Mutiny Maker" <notifications@mutinymaker.com>',
    to: user.email,
    subject: title,
    html: renderEmailTemplate(type, { title, message, userName: user.name }),
  });
}
```

---

## 12. SECURITY

### OWASP Top 10 Mitigations

| Threat | Mitigation |
|--------|-----------|
| **Broken Access Control** | Every route checks `authenticate` + `authorize`. Campaign routes verify brand owns the campaign. |
| **Cryptographic Failures** | bcrypt for passwords (cost: 12), JWT HS256, HTTPS only |
| **Injection** | Drizzle ORM parameterized queries, Zod input validation on all routes |
| **Insecure Design** | Rate limiting, payment webhook signature verification |
| **Security Misconfiguration** | Helmet.js headers, CORS whitelist, no sensitive data in JWT |
| **Vulnerable Components** | npm audit in CI, Dependabot alerts |
| **Auth Failures** | Short JWT lifetime (15min), refresh token rotation, single-use refresh tokens |
| **Integrity Failures** | Subresource integrity, signed uploads |
| **Logging Failures** | Winston structured logging, log all auth events, payment events |
| **SSRF** | Validate all URLs before fetch, no user-supplied URLs in server requests |

### Rate Limits

```typescript
// middleware/rateLimiter.ts
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }); // 10/15min
export const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 100 });     // 100/min
export const aiLimiter   = rateLimit({ windowMs: 60 * 1000, max: 20 });      // 20/min (OpenAI costs)
export const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });    // 10/min
```

### Helmet Config

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://*.s3.amazonaws.com"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```

### Campaign Ownership Check

```typescript
// Middleware to verify brand owns the campaign
export const requireCampaignOwnership = async (req, res, next) => {
  const campaign = await getCampaignById(req.params.campaignId);
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  if (campaign.brandId !== req.user.brandId) throw new HttpError(403, 'Forbidden');
  req.campaign = campaign;
  next();
};
```

---

## 13. ERROR HANDLING

### Error Class Hierarchy

```typescript
// shared/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Common errors
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super('UNAUTHORIZED', 'Authentication required', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super('FORBIDDEN', 'Insufficient permissions', 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}
```

### Global Error Handler

```typescript
// middleware/errorHandler.ts
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  logger.error({ err, req: { method: req.method, path: req.path } });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: err.errors },
    });
  }

  // Unexpected errors — don't leak internals
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
};
```

---

## 14. ENVIRONMENT CONFIGURATION

```bash
# .env.example
# On Railway: set these in the service's Variables tab (not committed to git)

# Server
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-frontend.railway.app

# Database — Railway provides this automatically when you add a Postgres plugin
# Copy from Railway dashboard: Postgres → Connect → DATABASE_URL
DATABASE_URL=postgresql://user:password@host:5432/railway

# Redis — Railway provides this automatically when you add a Redis plugin
# Copy from Railway dashboard: Redis → Connect → REDIS_URL
REDIS_URL=redis://default:password@host:6379

# Auth
JWT_SECRET=your-256-bit-secret-here   # generate: openssl rand -hex 32
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d

# File Storage (Railway Volume)
UPLOAD_PATH=/data/uploads              # matches your Railway volume mount path

# AI Provider — pick one, set the corresponding key
AI_PROVIDER=anthropic                  # 'anthropic' | 'openai' | 'gemini'
ANTHROPIC_API_KEY=                     # if AI_PROVIDER=anthropic
OPENAI_API_KEY=                        # if AI_PROVIDER=openai

# Payments (Razorpay)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Email — Resend is easiest to set up (resend.com, free tier available)
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=
EMAIL_FROM=notifications@mutinymaker.com

# Logging
LOG_LEVEL=info
```

> **Railway note:** `DATABASE_URL` and `REDIS_URL` are injected automatically by Railway when you add Postgres and Redis plugins to your project. You do NOT need to manually set these — Railway links them as reference variables.

---

## 15. DEPLOYMENT ARCHITECTURE

### Platform: Railway (Full Stack)

Everything lives in one Railway project with 4 services:

```
Railway Project: mutiny-maker
├── backend          (Node.js Express API + Socket.io)
│   └── Volume       /data  (persistent file storage)
├── worker           (Bull job processor — email + notifications)
├── postgres         (Railway managed PostgreSQL 16)
└── redis            (Railway managed Redis 7)
```

### Architecture Diagram

```
  Browser ──HTTPS──→  Railway CDN Edge
                             │
                    ┌────────▼─────────────────┐
                    │   Railway: backend        │
                    │   Node.js (Express)       │
                    │   + Socket.io             │
                    │                           │
                    │   /data (Volume)          │
                    │   ├── uploads/avatars/    │
                    │   ├── uploads/scripts/    │
                    │   └── uploads/submissions/│
                    └──┬──────────────┬─────────┘
                       │              │
          ┌────────────▼──┐    ┌──────▼──────────────┐
          │  Railway       │    │  Railway             │
          │  PostgreSQL 16 │    │  Redis 7             │
          │  (auto-backup) │    │  (sessions + queues) │
          └───────────────┘    └──────────┬───────────┘
                                          │
                               ┌──────────▼───────────┐
                               │   Railway: worker     │
                               │   Bull job processor  │
                               │   (email, notifs)     │
                               └──────────────────────┘
```

### Railway Service Setup

#### 1. Backend Service

```
Source:      GitHub repo (auto-deploy on push to main)
Root dir:    /backend
Build cmd:   npm run build
Start cmd:   node dist/index.js
Port:        3000

Volume:
  Mount path:  /data
  Size:        10GB (start), expandable

Health check:
  Path:        /health
  Timeout:     10s
```

#### 2. Worker Service

```
Source:      Same GitHub repo
Root dir:    /backend
Build cmd:   npm run build
Start cmd:   node dist/jobs/worker.js
Port:        (none — no HTTP)

Note: Shares same codebase, different start command.
      Does NOT need a volume mount.
```

#### 3. Postgres Plugin

```
Added via Railway dashboard → New → Database → PostgreSQL
Plan: Hobby ($5/mo) → Pro ($20/mo) when needed
Backups: Enable auto-backups (Railway Pro feature)
```

#### 4. Redis Plugin

```
Added via Railway dashboard → New → Database → Redis
Plan: Hobby ($5/mo)
```

### `railway.toml` (in `/backend`)

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 10
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev

# Create upload dirs if volume not yet mounted (local dev fallback)
RUN mkdir -p /data/uploads/avatars /data/uploads/scripts /data/uploads/submissions /data/uploads/logos

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Health Check Endpoint

```typescript
// Required by Railway for zero-downtime deploys
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### Environment Variables on Railway

Set these in Railway dashboard → Backend service → Variables:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | your Vite frontend URL |
| `DATABASE_URL` | auto-linked from Postgres plugin |
| `REDIS_URL` | auto-linked from Redis plugin |
| `JWT_SECRET` | generate: `openssl rand -hex 32` |
| `UPLOAD_PATH` | `/data/uploads` |
| `AI_PROVIDER` | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `RAZORPAY_KEY_ID` | from Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | from Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | set in Razorpay webhook config |
| `SMTP_PASS` | from Resend dashboard |

> Railway auto-injects `DATABASE_URL` and `REDIS_URL` via reference variables when plugins are linked.

### Custom Domain

```
Railway dashboard → Backend service → Settings → Custom Domain
→ Add: api.mutinymaker.com
→ Point DNS: CNAME → your-backend.railway.app
→ Railway auto-provisions TLS via Let's Encrypt
```

### Estimated Monthly Cost (Railway)

| Service | Plan | Cost |
|---------|------|------|
| Backend (Node.js) | Hobby | ~$5–15/mo (usage-based) |
| Worker | Hobby | ~$2–5/mo |
| PostgreSQL | Hobby | $5/mo |
| Redis | Hobby | $5/mo |
| Volume (10GB) | Included | $0.25/GB/mo |
| **Total** | | **~$20–35/mo** |

Upgrade to Pro ($20/mo base) when you need auto-backups, more RAM, or team collaboration.

---

## 16. MIGRATION FROM MOCK TO REAL API

### Frontend Migration Checklist (zero component changes needed)

The frontend is architected so components only import hooks. Migration = create hooks.

#### Step 1: Create hooks for each module

```typescript
// src/modules/campaigns/hooks/useCampaigns.ts
import { useQuery } from '@tanstack/react-query';
import { API } from '@/core/api';
import http from '@/core/http';

export function useCampaigns(filters?: CampaignFilters) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: () => http.get(API.campaigns.list, { params: filters }).then(r => r.data),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => http.get(API.campaigns.detail(id)).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCampaignDTO) => http.post(API.campaigns.create, data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}
```

#### Step 2: Replace mock imports in pages

```typescript
// BEFORE (in CampaignListPage.tsx):
import { MOCK_CAMPAIGNS } from '@/mocks/data';
const campaigns = MOCK_CAMPAIGNS;

// AFTER (zero other changes to the component):
import { useCampaigns } from '../hooks/useCampaigns';
const { data: campaigns, isLoading, error } = useCampaigns();
```

#### Step 3: Add .env to frontend

```bash
VITE_API_BASE_URL=https://api.mutinymaker.com/api/v1
VITE_WS_URL=wss://api.mutinymaker.com
```

#### Modules Migration Order (recommended sequence)

1. Auth (login, me endpoint) — unblocks everything else
2. Campaigns list + detail
3. Applications (ApplicationsTab)
4. Negotiation
5. Payments
6. Scripts (ScriptsTab)
7. Submissions (SubmissionsTab)
8. Discover (DiscoverPage + search)
9. Messages
10. Notifications
11. Analytics
12. AI Strategist

---

## APPENDIX: Quick API Reference

### Full Endpoint List (maps 1:1 to src/core/api.ts)

```
AUTH
  POST   /auth/register
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout
  GET    /auth/me

BRAND
  GET    /brand/profile
  PUT    /brand/profile
  POST   /brand/profile/avatar

CAMPAIGNS
  GET    /campaigns
  POST   /campaigns
  GET    /campaigns/:id
  PUT    /campaigns/:id
  DELETE /campaigns/:id
  POST   /campaigns/:id/launch
  POST   /campaigns/:id/close

  APPLICATIONS
    GET    /campaigns/:cId/applications
    POST   /campaigns/:cId/applications/:aId/approve
    POST   /campaigns/:cId/applications/:aId/reject

  NEGOTIATION
    GET    /campaigns/:cId/negotiation/:iId
    POST   /campaigns/:cId/negotiation/:iId/accept
    POST   /campaigns/:cId/negotiation/:iId/counter

  PAYMENT
    POST   /campaigns/:cId/payment
    GET    /campaigns/:cId/payment/status

  SCRIPTS
    GET    /campaigns/:cId/scripts
    POST   /campaigns/:cId/scripts/:sId/approve
    POST   /campaigns/:cId/scripts/:sId/revise

  SUBMISSIONS
    GET    /campaigns/:cId/submissions
    POST   /campaigns/:cId/submissions/:sId/approve
    POST   /campaigns/:cId/submissions/:sId/reject

  CHAT
    GET    /campaigns/:cId/chat/:iId
    POST   /campaigns/:cId/chat/:iId

DISCOVER
  GET    /influencers/search
  GET    /influencers/:id
  POST   /influencers/invite
  POST   /influencers/bulk-invite

ANALYTICS
  GET    /analytics/overview
  GET    /analytics/campaigns/:cId
  GET    /analytics/content

NOTIFICATIONS
  GET    /notifications
  POST   /notifications/:id/read
  POST   /notifications/read-all

MESSAGES
  GET    /messages
  GET    /messages/:id
  POST   /messages/:id

PAYMENTS (webhooks)
  POST   /payments/webhook

AI
  POST   /ai/strategist

UPLOADS
  POST   /uploads/avatar
  POST   /uploads/script
  POST   /uploads/submission
```

**Total: 50 endpoints + 12 WebSocket events**
