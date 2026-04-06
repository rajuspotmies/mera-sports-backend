import type { OpenAPIV3 } from 'openapi-types';

// ─── Reusable schemas ───────────────────────────────────────────────────────

const PaginationMeta: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 100 },
    totalPages: { type: 'integer', example: 5 },
  },
};

const ErrorResponse: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'UNAUTHORIZED' },
        message: { type: 'string', example: 'Authentication required' },
        details: { type: 'object', nullable: true },
      },
    },
  },
};

const SuccessResponse = (dataSchema: OpenAPIV3.SchemaObject, withMeta = false): OpenAPIV3.SchemaObject => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
    ...(withMeta ? { meta: PaginationMeta } : {}),
  },
});

// ─── Common parameters ───────────────────────────────────────────────────────

const paginationParams: OpenAPIV3.ParameterObject[] = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
];

// ─── Security schemes ────────────────────────────────────────────────────────

const bearerAuth: OpenAPIV3.SecurityRequirementObject = { bearerAuth: [] };
const cookieAuth: OpenAPIV3.SecurityRequirementObject = { cookieAuth: [] };

// ─── Common responses ───────────────────────────────────────────────────────

const unauthorizedResponse: OpenAPIV3.ResponseObject = {
  description: 'Unauthorized',
  content: { 'application/json': { schema: ErrorResponse } },
};
const forbiddenResponse: OpenAPIV3.ResponseObject = {
  description: 'Forbidden',
  content: { 'application/json': { schema: ErrorResponse } },
};
const notFoundResponse: OpenAPIV3.ResponseObject = {
  description: 'Not Found',
  content: { 'application/json': { schema: ErrorResponse } },
};
const validationResponse: OpenAPIV3.ResponseObject = {
  description: 'Validation Error',
  content: { 'application/json': { schema: ErrorResponse } },
};

const standardErrors = {
  400: validationResponse,
  401: unauthorizedResponse,
  403: forbiddenResponse,
  404: notFoundResponse,
};

// ─── Spec ───────────────────────────────────────────────────────────────────

export const swaggerSpec: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'MutinyX API',
    version: '1.0.0',
    description: `
## Overview

MutinyX is an influencer-brand collaboration platform. This API serves three roles:
- **brand_owner** — registers, creates campaigns, manages payments
- **influencer** — OTP-based login, applies to campaigns, submits content
- **admin** — manages platform, settlements, moderation

## Authentication

All protected endpoints require a JWT. Supply it as:
- \`Authorization: Bearer <token>\` header (recommended for mobile)
- Role-specific HttpOnly cookie set after login (\`brand_owner_access_token\`, \`influencer_access_token\`, \`admin_access_token\`)

Cookie-based requests must also send \`X-Requested-With: XMLHttpRequest\` for CSRF protection on mutating operations.

## Response format

\`\`\`json
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }
\`\`\`
Errors:
\`\`\`json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
\`\`\`
    `.trim(),
    contact: { name: 'MutinyX Engineering' },
  },
  servers: [
    { url: '/api/v1', description: 'Current server' },
    { url: 'http://localhost:3000/api/v1', description: 'Local development' },
  ],
  tags: [
    { name: 'Health', description: 'Server health check' },
    { name: 'Brand Auth', description: 'Brand owner authentication' },
    { name: 'Brand Profile', description: 'Brand owner profile management' },
    { name: 'Influencer Auth', description: 'Influencer OTP-based authentication' },
    { name: 'Influencer Profile', description: 'Influencer profile and portfolio' },
    { name: 'Influencer Bank Details', description: 'Influencer bank account management' },
    { name: 'Social', description: 'Social platform connections (Instagram etc.)' },
    { name: 'Admin Auth', description: 'Admin authentication' },
    { name: 'Admin Dashboard', description: 'Admin stats, user & campaign management' },
    { name: 'Admin Settlements', description: 'Payment settlements for influencers' },
    { name: 'Campaigns', description: 'Campaign CRUD and lifecycle' },
    { name: 'Applications', description: 'Campaign applications and invite flow' },
    { name: 'Negotiation', description: 'Offer negotiation between brand and influencer' },
    { name: 'Scripts', description: 'Script submission and approval' },
    { name: 'Submissions', description: 'Final work submission and approval' },
    { name: 'Payments', description: 'Payment rounds via Cashfree' },
    { name: 'Invoice', description: 'Invoice generation and delivery' },
    { name: 'Notifications', description: 'In-app and push notifications' },
    { name: 'Messages', description: 'Conversations and messages' },
    { name: 'Analytics', description: 'Platform analytics' },
    { name: 'AI', description: 'AI-powered strategist and smart-select' },
    { name: 'Reports', description: 'User reporting and blocking' },
    { name: 'Uploads', description: 'S3 file proxy' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token returned by login/verify-otp endpoints',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'brand_owner_access_token',
        description: 'HttpOnly cookie set on login. Name varies by role: brand_owner_access_token | influencer_access_token | admin_access_token',
      },
    },
    schemas: {
      PaginationMeta,
      ErrorResponse,

      // ── Auth ──────────────────────────────────────────────────────────────
      RegisterBody: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string' },
          brandName: { type: 'string', description: 'Required for brand_owner role' },
        },
      },
      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      ForgotPasswordBody: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
      ResetPasswordBody: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string' },
          password: { type: 'string', minLength: 8 },
        },
      },
      ChangePasswordBody: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
      SendOtpBody: {
        type: 'object',
        required: ['phone'],
        properties: { phone: { type: 'string', example: '+919876543210' } },
      },
      VerifyOtpBody: {
        type: 'object',
        required: ['phone', 'code'],
        properties: {
          phone: { type: 'string', example: '+919876543210' },
          code: { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
      UpdateMeBody: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'JWT access token (included for mobile clients)' },
              refreshToken: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  role: { type: 'string', enum: ['brand_owner', 'influencer', 'admin'] },
                },
              },
            },
          },
        },
      },

      // ── Brand ──────────────────────────────────────────────────────────────
      BrandProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          brandName: { type: 'string' },
          logoUrl: { type: 'string', nullable: true },
          website: { type: 'string', nullable: true },
          industry: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          socialLinks: { type: 'array', items: { type: 'string' } },
        },
      },
      UpdateBrandBody: {
        type: 'object',
        properties: {
          brandName: { type: 'string', minLength: 2, maxLength: 255 },
          website: { type: 'string' },
          industry: { type: 'string' },
          description: { type: 'string' },
          socialLinks: { type: 'array', items: { type: 'string' } },
        },
      },

      // ── Influencer ────────────────────────────────────────────────────────
      InfluencerProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          handle: { type: 'string' },
          bio: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          tier: { type: 'string', enum: ['nano', 'micro', 'mid', 'macro', 'mega'] },
          niche: { type: 'string', nullable: true },
          location: { type: 'string', nullable: true },
          avgViews: { type: 'integer', nullable: true },
          avgLikes: { type: 'integer', nullable: true },
          followerCount: { type: 'integer', nullable: true },
          engagementRate: { type: 'number', nullable: true },
          platforms: { type: 'array', items: { type: 'string' } },
          portfolio: { type: 'array', items: { $ref: '#/components/schemas/PortfolioItem' } },
        },
      },
      UpdateInfluencerProfileBody: {
        type: 'object',
        properties: {
          handle: { type: 'string' },
          bio: { type: 'string' },
          niche: { type: 'string' },
          location: { type: 'string' },
          platforms: { type: 'array', items: { type: 'string' } },
        },
      },
      PortfolioItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          url: { type: 'string' },
          platform: { type: 'string' },
          mediaUrl: { type: 'string', nullable: true },
          views: { type: 'integer', nullable: true },
          likes: { type: 'integer', nullable: true },
          featured: { type: 'boolean' },
        },
      },
      AddPortfolioItemBody: {
        type: 'object',
        required: ['title', 'url', 'platform'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          platform: { type: 'string' },
          mediaUrl: { type: 'string' },
          views: { type: 'integer' },
          likes: { type: 'integer' },
          featured: { type: 'boolean' },
        },
      },
      BankDetails: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          accountHolderName: { type: 'string' },
          accountNumber: { type: 'string' },
          ifscCode: { type: 'string' },
          bankName: { type: 'string' },
          upiId: { type: 'string', nullable: true },
        },
      },
      UpsertBankDetailsBody: {
        type: 'object',
        required: ['accountHolderName', 'accountNumber', 'ifscCode', 'bankName'],
        properties: {
          accountHolderName: { type: 'string' },
          accountNumber: { type: 'string' },
          ifscCode: { type: 'string' },
          bankName: { type: 'string' },
          upiId: { type: 'string' },
        },
      },

      // ── Social ────────────────────────────────────────────────────────────
      ConnectSocialBody: {
        type: 'object',
        required: ['platform', 'accessToken'],
        properties: {
          platform: { type: 'string', enum: ['instagram', 'youtube', 'twitter'] },
          accessToken: { type: 'string', description: 'Short-lived token from Facebook/platform OAuth' },
        },
      },
      DisconnectSocialBody: {
        type: 'object',
        required: ['platform'],
        properties: {
          platform: { type: 'string', enum: ['instagram', 'youtube', 'twitter'] },
        },
      },

      // ── Campaign ──────────────────────────────────────────────────────────
      TierEnum: { type: 'string', enum: ['nano', 'micro', 'mid', 'macro', 'mega'] },
      TierConfig: {
        type: 'object',
        required: ['tier', 'count', 'amount'],
        properties: {
          tier: { $ref: '#/components/schemas/TierEnum' },
          count: { type: 'integer', minimum: 1 },
          amount: { type: 'number', minimum: 0 },
        },
      },
      CreateCampaignBody: {
        type: 'object',
        required: ['basics', 'deliverables', 'budget'],
        properties: {
          basics: {
            type: 'object',
            required: ['campaignName', 'coverImageUrl', 'type', 'niche', 'objective', 'location'],
            properties: {
              campaignName: { type: 'string', maxLength: 255 },
              coverImageUrl: { type: 'string' },
              type: { type: 'string', enum: ['influencer', 'ugc', 'meme', 'twitter'] },
              niche: { type: 'string' },
              visibility: { type: 'string', enum: ['public', 'private'], default: 'public' },
              objective: { type: 'string' },
              location: { type: 'string' },
            },
          },
          deliverables: {
            type: 'object',
            required: ['industry', 'platform', 'contentTypes', 'postingType', 'brandGuidelines', 'scriptType'],
            properties: {
              industry: { type: 'string' },
              mainContentType: { type: 'string' },
              platform: { type: 'string', enum: ['instagram', 'youtube', 'twitter'] },
              contentTypes: { type: 'array', items: { type: 'string' } },
              postingType: { type: 'string', enum: ['creator', 'brand'] },
              usageRights: { type: 'string' },
              brandGuidelines: { type: 'string' },
              references: { type: 'array', items: { type: 'string' } },
              scriptType: { type: 'string', enum: ['creator', 'brand'] },
              scriptFlow: { type: 'string' },
              scriptFileName: { type: 'string', nullable: true },
              proofOfWorkRequired: { type: 'boolean' },
            },
          },
          budget: {
            type: 'object',
            required: ['budgetMode', 'totalBudget', 'mixMode', 'tierConfig', 'platformFeePercent', 'applicationDeadline', 'workDeadline'],
            properties: {
              budgetMode: { type: 'string', enum: ['paid', 'product', 'paid_product'] },
              totalBudget: { type: 'number', minimum: 0.01 },
              mixMode: { type: 'boolean', description: 'true = multiple tiers, false = single tier' },
              selectedTier: { $ref: '#/components/schemas/TierEnum', description: 'Required when mixMode is false' },
              creatorSizes: { type: 'array', items: { $ref: '#/components/schemas/TierEnum' }, description: 'Required when mixMode is true' },
              tierConfig: { type: 'array', items: { $ref: '#/components/schemas/TierConfig' } },
              platformFeePercent: { type: 'number', minimum: 0, maximum: 100 },
              productDetails: { type: 'string' },
              applicationDeadline: { type: 'string', format: 'date-time' },
              workDeadline: { type: 'string', format: 'date-time' },
              scriptDeadline: { type: 'string', format: 'date-time', description: 'Required when scriptType is creator' },
            },
          },
          meta: {
            type: 'object',
            properties: {
              hashtags: { type: 'array', items: { type: 'string' } },
              referenceUrls: { type: 'array', items: { type: 'string' } },
              status: { type: 'string', enum: ['draft', 'active'], default: 'draft' },
              proofOfWorkReq: { type: 'boolean' },
            },
          },
        },
      },
      Campaign: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          brandId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['draft', 'active', 'script', 'work', 'completed', 'closed', 'withdrawn'] },
          basics: { type: 'object' },
          deliverables: { type: 'object' },
          budget: { type: 'object' },
          meta: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      // ── Applications ──────────────────────────────────────────────────────
      Application: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          campaignId: { type: 'string', format: 'uuid' },
          influencerId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'invited', 'accepted', 'declined', 'withdrawn'] },
          proposedRate: { type: 'number', nullable: true },
          note: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ApplyToCampaignBody: {
        type: 'object',
        properties: {
          proposedRate: { type: 'number' },
          note: { type: 'string' },
        },
      },

      // ── Negotiation ───────────────────────────────────────────────────────
      NegotiationOffer: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          campaignId: { type: 'string', format: 'uuid' },
          influencerId: { type: 'string', format: 'uuid' },
          offeredBy: { type: 'string', enum: ['brand', 'influencer'] },
          amount: { type: 'number' },
          note: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'countered'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CounterOfferBody: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { type: 'number', minimum: 0 },
          note: { type: 'string' },
        },
      },
      AcceptOfferBody: {
        type: 'object',
        properties: {
          note: { type: 'string' },
        },
      },

      // ── Scripts / Submissions ─────────────────────────────────────────────
      Script: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          campaignId: { type: 'string', format: 'uuid' },
          influencerId: { type: 'string', format: 'uuid' },
          fileUrl: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'approved', 'revision_requested'] },
          revisionNote: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Submission: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          campaignId: { type: 'string', format: 'uuid' },
          influencerId: { type: 'string', format: 'uuid' },
          fileUrl: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          rejectionNote: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      // ── Payments ──────────────────────────────────────────────────────────
      InitiatePaymentBody: {
        type: 'object',
        required: ['influencerIds'],
        properties: {
          influencerIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          note: { type: 'string' },
        },
      },
      VerifyPaymentBody: {
        type: 'object',
        required: ['orderId', 'paymentId'],
        properties: {
          orderId: { type: 'string' },
          paymentId: { type: 'string' },
        },
      },
      PaymentRound: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          campaignId: { type: 'string', format: 'uuid' },
          orderId: { type: 'string' },
          totalAmount: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'captured', 'failed', 'cancelled'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      // ── Notifications ─────────────────────────────────────────────────────
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          type: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          isRead: { type: 'boolean' },
          data: { type: 'object', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      // ── Messages ──────────────────────────────────────────────────────────
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          participants: { type: 'array', items: { type: 'string', format: 'uuid' } },
          lastMessage: { type: 'string', nullable: true },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          conversationId: { type: 'string', format: 'uuid' },
          senderId: { type: 'string', format: 'uuid' },
          content: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      // ── Reports ───────────────────────────────────────────────────────────
      CreateReportBody: {
        type: 'object',
        required: ['targetId', 'reason'],
        properties: {
          targetId: { type: 'string', format: 'uuid' },
          targetType: { type: 'string', enum: ['brand', 'influencer'] },
          reason: { type: 'string' },
          details: { type: 'string' },
        },
      },
      CreateBlockBody: {
        type: 'object',
        required: ['targetId'],
        properties: {
          targetId: { type: 'string', format: 'uuid' },
          targetType: { type: 'string', enum: ['brand', 'influencer'] },
        },
      },

      // ── Admin ─────────────────────────────────────────────────────────────
      SettleInfluencerBody: {
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { type: 'number', minimum: 0 },
          note: { type: 'string' },
          transactionRef: { type: 'string' },
        },
      },
      UpdateUserStatusBody: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'banned', 'suspended'] },
          reason: { type: 'string' },
        },
      },

      // ── AI ────────────────────────────────────────────────────────────────
      StrategistBody: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', description: 'Campaign strategy question or goal' },
          campaignId: { type: 'string', format: 'uuid', description: 'Optional campaign context' },
        },
      },
      SmartSelectBody: {
        type: 'object',
        required: ['campaignId'],
        properties: {
          campaignId: { type: 'string', format: 'uuid' },
          count: { type: 'integer', default: 10, description: 'Number of influencers to recommend' },
        },
      },
    },
    responses: {
      Unauthorized: unauthorizedResponse,
      Forbidden: forbiddenResponse,
      NotFound: notFoundResponse,
      ValidationError: validationResponse,
    },
  },
  security: [bearerAuth, cookieAuth],
  paths: {
    // ═══════════════════════════════════════════════════════════════════════
    // Health
    // ═══════════════════════════════════════════════════════════════════════
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        security: [],
        responses: {
          200: {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Brand Auth
    // ═══════════════════════════════════════════════════════════════════════
    '/brand/auth/register': {
      post: {
        tags: ['Brand Auth'],
        summary: 'Register a new brand account',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterBody' } } } },
        responses: {
          201: { description: 'Registered successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: validationResponse,
          409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/brand/auth/login': {
      post: {
        tags: ['Brand Auth'],
        summary: 'Login as brand owner',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginBody' } } } },
        responses: {
          200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: validationResponse,
          401: unauthorizedResponse,
        },
      },
    },
    '/brand/auth/refresh': {
      post: {
        tags: ['Brand Auth'],
        summary: 'Refresh brand access token',
        description: 'Uses the refresh token cookie to issue a new access token.',
        security: [],
        responses: {
          200: { description: 'Token refreshed', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: unauthorizedResponse,
        },
      },
    },
    '/brand/auth/logout': {
      post: {
        tags: ['Brand Auth'],
        summary: 'Logout brand owner (clears cookies)',
        security: [],
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/brand/auth/forgot-password': {
      post: {
        tags: ['Brand Auth'],
        summary: 'Send password reset email',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ForgotPasswordBody' } } } },
        responses: { 200: { description: 'Reset email sent if account exists' } },
      },
    },
    '/brand/auth/reset-password': {
      post: {
        tags: ['Brand Auth'],
        summary: 'Reset password using token from email',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetPasswordBody' } } } },
        responses: { 200: { description: 'Password reset successful' }, 400: validationResponse, 401: unauthorizedResponse },
      },
    },
    '/brand/auth/me': {
      get: {
        tags: ['Brand Auth'],
        summary: 'Get current brand user',
        responses: {
          200: { description: 'Current user', content: { 'application/json': { schema: SuccessResponse({ type: 'object' }) } } },
          ...standardErrors,
        },
      },
      put: {
        tags: ['Brand Auth'],
        summary: 'Update current brand user (name/email)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateMeBody' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
      delete: {
        tags: ['Brand Auth'],
        summary: 'Delete brand account',
        responses: { 200: { description: 'Account deleted' }, ...standardErrors },
      },
    },
    '/brand/auth/change-password': {
      post: {
        tags: ['Brand Auth'],
        summary: 'Change password (requires current password)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordBody' } } } },
        responses: { 200: { description: 'Password changed' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Brand Profile
    // ═══════════════════════════════════════════════════════════════════════
    '/brand/profile': {
      get: {
        tags: ['Brand Profile'],
        summary: 'Get brand profile',
        responses: {
          200: { description: 'Brand profile', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/BrandProfile' } as any) } } },
          ...standardErrors,
        },
      },
      put: {
        tags: ['Brand Profile'],
        summary: 'Update brand profile',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateBrandBody' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
    },
    '/brand/profile/avatar': {
      post: {
        tags: ['Brand Profile'],
        summary: 'Upload brand logo',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } }, required: ['avatar'] } } },
        },
        responses: { 200: { description: 'Logo uploaded, returns new URL' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Influencer Auth
    // ═══════════════════════════════════════════════════════════════════════
    '/influencers/auth/send-otp': {
      post: {
        tags: ['Influencer Auth'],
        summary: 'Send OTP to phone number',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SendOtpBody' } } } },
        responses: { 200: { description: 'OTP sent' }, 400: validationResponse, 429: { description: 'Rate limit exceeded' } },
      },
    },
    '/influencers/auth/verify-otp': {
      post: {
        tags: ['Influencer Auth'],
        summary: 'Verify OTP and login / register influencer',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyOtpBody' } } } },
        responses: {
          200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: validationResponse,
          401: unauthorizedResponse,
        },
      },
    },
    '/influencers/auth/refresh': {
      post: {
        tags: ['Influencer Auth'],
        summary: 'Refresh influencer access token',
        security: [],
        responses: { 200: { description: 'Token refreshed', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } }, 401: unauthorizedResponse },
      },
    },
    '/influencers/auth/logout': {
      post: {
        tags: ['Influencer Auth'],
        summary: 'Logout influencer',
        security: [],
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/influencers/auth/me': {
      get: {
        tags: ['Influencer Auth'],
        summary: 'Get current influencer user',
        responses: { 200: { description: 'Current user' }, ...standardErrors },
      },
      put: {
        tags: ['Influencer Auth'],
        summary: 'Update current influencer user',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateMeBody' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
      delete: {
        tags: ['Influencer Auth'],
        summary: 'Delete influencer account',
        responses: { 200: { description: 'Account deleted' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Influencer Profile
    // ═══════════════════════════════════════════════════════════════════════
    '/influencers/profile': {
      get: {
        tags: ['Influencer Profile'],
        summary: 'Get own influencer profile',
        responses: {
          200: { description: 'Influencer profile', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/InfluencerProfile' } as any) } } },
          ...standardErrors,
        },
      },
      put: {
        tags: ['Influencer Profile'],
        summary: 'Update own influencer profile',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateInfluencerProfileBody' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
    },
    '/influencers/profile/avatar': {
      post: {
        tags: ['Influencer Profile'],
        summary: 'Upload influencer avatar',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } },
        },
        responses: { 200: { description: 'Avatar uploaded' }, ...standardErrors },
      },
    },
    '/influencers/profile/portfolio-media': {
      post: {
        tags: ['Influencer Profile'],
        summary: 'Upload portfolio media files (up to 10)',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } }, required: ['files'] } } },
        },
        responses: { 200: { description: 'Files uploaded, returns S3 keys' }, ...standardErrors },
      },
    },
    '/influencers/portfolio': {
      post: {
        tags: ['Influencer Profile'],
        summary: 'Add a portfolio item',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AddPortfolioItemBody' } } } },
        responses: { 201: { description: 'Portfolio item created', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/PortfolioItem' } as any) } } }, ...standardErrors },
      },
    },
    '/influencers/portfolio/{itemId}': {
      patch: {
        tags: ['Influencer Profile'],
        summary: 'Update a portfolio item',
        parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AddPortfolioItemBody' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
      delete: {
        tags: ['Influencer Profile'],
        summary: 'Delete a portfolio item',
        parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Deleted' }, ...standardErrors },
      },
    },
    '/influencers/applications': {
      get: {
        tags: ['Influencer Profile'],
        summary: 'Get my campaign applications',
        parameters: [
          ...paginationParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'invited', 'accepted', 'declined'] } },
        ],
        responses: {
          200: { description: 'List of applications', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Application' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/influencers/search': {
      get: {
        tags: ['Influencer Profile'],
        summary: 'Search influencers (brand_owner or admin)',
        parameters: [
          ...paginationParams,
          { name: 'niche', in: 'query', schema: { type: 'string' } },
          { name: 'tier', in: 'query', schema: { type: 'string', enum: ['nano', 'micro', 'mid', 'macro', 'mega'] } },
          { name: 'platform', in: 'query', schema: { type: 'string' } },
          { name: 'location', in: 'query', schema: { type: 'string' } },
          { name: 'minFollowers', in: 'query', schema: { type: 'integer' } },
          { name: 'maxFollowers', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Search results', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/InfluencerProfile' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/influencers/{id}': {
      get: {
        tags: ['Influencer Profile'],
        summary: 'Get influencer profile by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Influencer profile', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/InfluencerProfile' } as any) } } },
          ...standardErrors,
        },
      },
    },
    '/influencers/{id}/bookmark': {
      post: {
        tags: ['Influencer Profile'],
        summary: 'Toggle bookmark on an influencer (brand_owner only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Bookmark toggled' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Influencer Bank Details
    // ═══════════════════════════════════════════════════════════════════════
    '/influencers/bank-details': {
      get: {
        tags: ['Influencer Bank Details'],
        summary: 'Get own bank details',
        responses: {
          200: { description: 'Bank details', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/BankDetails' } as any) } } },
          ...standardErrors,
        },
      },
      post: {
        tags: ['Influencer Bank Details'],
        summary: 'Create bank details',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpsertBankDetailsBody' } } } },
        responses: { 201: { description: 'Created' }, ...standardErrors },
      },
      put: {
        tags: ['Influencer Bank Details'],
        summary: 'Update bank details',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpsertBankDetailsBody' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
      delete: {
        tags: ['Influencer Bank Details'],
        summary: 'Delete bank details',
        responses: { 200: { description: 'Deleted' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Social
    // ═══════════════════════════════════════════════════════════════════════
    '/influencers/social/connect': {
      post: {
        tags: ['Social'],
        summary: 'Connect a social platform (Instagram etc.)',
        description: 'Exchanges a short-lived access token for a long-lived one, fetches platform stats, and saves them.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ConnectSocialBody' } } } },
        responses: { 200: { description: 'Connected successfully, returns stats snapshot' }, ...standardErrors },
      },
    },
    '/influencers/social/disconnect': {
      post: {
        tags: ['Social'],
        summary: 'Disconnect a social platform',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DisconnectSocialBody' } } } },
        responses: { 200: { description: 'Disconnected' }, ...standardErrors },
      },
    },
    '/influencers/social/status': {
      get: {
        tags: ['Social'],
        summary: 'Get connection status for all social platforms',
        responses: {
          200: {
            description: 'Platform connection statuses',
            content: {
              'application/json': {
                schema: SuccessResponse({
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      connected: { type: 'boolean' },
                      platform: { type: 'string' },
                      username: { type: 'string', nullable: true },
                    },
                  },
                }),
              },
            },
          },
          ...standardErrors,
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Admin Auth
    // ═══════════════════════════════════════════════════════════════════════
    '/admin/auth/login': {
      post: {
        tags: ['Admin Auth'],
        summary: 'Admin login',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginBody' } } } },
        responses: { 200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } }, 400: validationResponse, 401: unauthorizedResponse },
      },
    },
    '/admin/auth/refresh': {
      post: {
        tags: ['Admin Auth'],
        summary: 'Refresh admin access token',
        security: [],
        responses: { 200: { description: 'Token refreshed' }, 401: unauthorizedResponse },
      },
    },
    '/admin/auth/logout': {
      post: {
        tags: ['Admin Auth'],
        summary: 'Admin logout',
        security: [],
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/admin/auth/me': {
      get: {
        tags: ['Admin Auth'],
        summary: 'Get current admin user',
        responses: { 200: { description: 'Admin user' }, ...standardErrors },
      },
      put: {
        tags: ['Admin Auth'],
        summary: 'Update admin user',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateMeBody' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
      delete: {
        tags: ['Admin Auth'],
        summary: 'Delete admin account',
        responses: { 200: { description: 'Deleted' }, ...standardErrors },
      },
    },
    '/admin/auth/me/avatar': {
      post: {
        tags: ['Admin Auth'],
        summary: 'Upload admin avatar',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } },
        },
        responses: { 200: { description: 'Avatar uploaded' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Admin Dashboard
    // ═══════════════════════════════════════════════════════════════════════
    '/admin/stats': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Platform-wide dashboard statistics',
        responses: {
          200: {
            description: 'Dashboard stats',
            content: {
              'application/json': {
                schema: SuccessResponse({
                  type: 'object',
                  properties: {
                    totalBrands: { type: 'integer' },
                    totalInfluencers: { type: 'integer' },
                    totalCampaigns: { type: 'integer' },
                    totalRevenue: { type: 'number' },
                    activeCampaigns: { type: 'integer' },
                  },
                }),
              },
            },
          },
          ...standardErrors,
        },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'List all users (brands + influencers)',
        parameters: [
          ...paginationParams,
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['brand_owner', 'influencer'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'banned', 'suspended'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'User list', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { type: 'object' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/admin/users/{id}': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Get user detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'User detail' }, ...standardErrors },
      },
    },
    '/admin/users/{id}/status': {
      patch: {
        tags: ['Admin Dashboard'],
        summary: 'Update user status (ban/suspend/reactivate)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUserStatusBody' } } } },
        responses: { 200: { description: 'Status updated' }, ...standardErrors },
      },
    },
    '/admin/campaigns': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'List all campaigns (admin view)',
        parameters: [
          ...paginationParams,
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'brandId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Campaign list', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Campaign' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/admin/campaigns/{id}': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Get campaign detail (admin view)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Campaign detail' }, ...standardErrors },
      },
      patch: {
        tags: ['Admin Dashboard'],
        summary: 'Update campaign (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'Partial campaign update (same shape as UpdateCampaignBody)' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
    },
    '/admin/reports': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'List user reports',
        parameters: [
          ...paginationParams,
          { name: 'resolved', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'Reports list', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { type: 'object' } }, true) } } }, ...standardErrors },
      },
    },
    '/admin/reports/{id}/resolve': {
      patch: {
        tags: ['Admin Dashboard'],
        summary: 'Resolve a report',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Resolved' }, ...standardErrors },
      },
    },
    '/admin/influencers/{influencerUserId}/bank-details': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Get bank details for a specific influencer (for settling)',
        parameters: [{ name: 'influencerUserId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Bank details', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/BankDetails' } as any) } } },
          ...standardErrors,
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Admin Settlements
    // ═══════════════════════════════════════════════════════════════════════
    '/admin/settlements/unsettled': {
      get: {
        tags: ['Admin Settlements'],
        summary: 'List influencers pending settlement',
        parameters: paginationParams,
        responses: {
          200: { description: 'Unsettled list', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { type: 'object' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/admin/settlements': {
      get: {
        tags: ['Admin Settlements'],
        summary: 'List all settlement records',
        parameters: paginationParams,
        responses: {
          200: { description: 'Settlements', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { type: 'object' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/admin/settlements/{ciId}': {
      post: {
        tags: ['Admin Settlements'],
        summary: 'Settle payment for an influencer on a campaign',
        parameters: [{ name: 'ciId', in: 'path', required: true, description: 'Campaign–influencer join ID', schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SettleInfluencerBody' } } } },
        responses: { 200: { description: 'Settlement recorded' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Campaigns
    // ═══════════════════════════════════════════════════════════════════════
    '/campaigns': {
      get: {
        tags: ['Campaigns'],
        summary: 'List campaigns for the authenticated user (brand: own campaigns; influencer: discover)',
        parameters: [
          ...paginationParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'active', 'script', 'work', 'completed', 'closed', 'withdrawn'] } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['influencer', 'ugc', 'meme', 'twitter'] } },
          { name: 'visibility', in: 'query', schema: { type: 'string', enum: ['public', 'private'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['createdAt', 'deadline', 'progress'], default: 'createdAt' } },
        ],
        responses: {
          200: { description: 'Campaign list', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Campaign' } }, true) } } },
          ...standardErrors,
        },
      },
      post: {
        tags: ['Campaigns'],
        summary: 'Create a new campaign (brand_owner or admin)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateCampaignBody' } } } },
        responses: {
          201: { description: 'Campaign created', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/Campaign' } as any) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/discover': {
      get: {
        tags: ['Campaigns'],
        summary: 'Discover public campaigns (influencer or admin)',
        parameters: [
          ...paginationParams,
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['influencer', 'ugc', 'meme', 'twitter'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['createdAt', 'deadline', 'progress'] } },
        ],
        responses: {
          200: { description: 'Discoverable campaigns', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Campaign' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{id}': {
      get: {
        tags: ['Campaigns'],
        summary: 'Get campaign by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Campaign', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/Campaign' } as any) } } },
          ...standardErrors,
        },
      },
      put: {
        tags: ['Campaigns'],
        summary: 'Update campaign (brand_owner or admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'Partial update — same structure as CreateCampaignBody, all fields optional' } } } },
        responses: { 200: { description: 'Updated' }, ...standardErrors },
      },
      delete: {
        tags: ['Campaigns'],
        summary: 'Delete campaign (brand_owner or admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Deleted' }, ...standardErrors },
      },
    },
    '/campaigns/{id}/launch': {
      post: {
        tags: ['Campaigns'],
        summary: 'Launch campaign (change status to active)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Campaign launched' }, ...standardErrors },
      },
    },
    '/campaigns/{id}/close': {
      post: {
        tags: ['Campaigns'],
        summary: 'Close campaign',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Campaign closed' }, ...standardErrors },
      },
    },
    '/campaigns/{id}/thumbnail': {
      post: {
        tags: ['Campaigns'],
        summary: 'Upload campaign thumbnail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } },
        },
        responses: { 200: { description: 'Thumbnail uploaded' }, ...standardErrors },
      },
    },
    '/campaigns/{id}/invite': {
      post: {
        tags: ['Campaigns'],
        summary: 'Invite influencers to a campaign',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['influencerIds'],
                properties: { influencerIds: { type: 'array', items: { type: 'string', format: 'uuid' } } },
              },
            },
          },
        },
        responses: { 200: { description: 'Invites sent' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Applications
    // ═══════════════════════════════════════════════════════════════════════
    '/campaigns/{campaignId}/applications': {
      get: {
        tags: ['Applications'],
        summary: 'List applications for a campaign (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ...paginationParams,
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Applications', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Application' } }, true) } } },
          ...standardErrors,
        },
      },
      post: {
        tags: ['Applications'],
        summary: 'Apply to a public campaign (influencer)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: false, content: { 'application/json': { schema: { $ref: '#/components/schemas/ApplyToCampaignBody' } } } },
        responses: {
          201: { description: 'Application submitted', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/Application' } as any) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/applications/status-board': {
      get: {
        tags: ['Applications'],
        summary: 'Status board view — all influencers for a campaign (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ...paginationParams,
        ],
        responses: {
          200: { description: 'Status board', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Application' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/applications/accept-invite': {
      post: {
        tags: ['Applications'],
        summary: 'Accept a brand invite (influencer)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Invite accepted' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/applications/decline-invite': {
      post: {
        tags: ['Applications'],
        summary: 'Decline a brand invite (influencer)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Invite declined' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/applications/product-received': {
      post: {
        tags: ['Applications'],
        summary: 'Confirm product received (influencer)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Product received confirmed' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/applications/{appId}/approve': {
      post: {
        tags: ['Applications'],
        summary: 'Approve an application (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'appId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Approved' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/applications/{appId}/reject': {
      post: {
        tags: ['Applications'],
        summary: 'Reject an application (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'appId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Rejected' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/applications/{appId}/product-shipped': {
      post: {
        tags: ['Applications'],
        summary: 'Mark product as shipped (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'appId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Marked as shipped' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/applications/{appId}/product-delivered': {
      post: {
        tags: ['Applications'],
        summary: 'Force-mark product as delivered (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'appId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Marked as delivered' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Negotiation
    // ═══════════════════════════════════════════════════════════════════════
    '/campaigns/{campaignId}/negotiation/{influencerId}': {
      get: {
        tags: ['Negotiation'],
        summary: 'Get negotiation history between brand and influencer',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'influencerId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Negotiation history', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/NegotiationOffer' } }) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/negotiation/{influencerId}/counter': {
      post: {
        tags: ['Negotiation'],
        summary: 'Make a counter offer',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'influencerId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CounterOfferBody' } } } },
        responses: {
          201: { description: 'Offer created', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/NegotiationOffer' } as any) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/negotiation/{influencerId}/accept': {
      post: {
        tags: ['Negotiation'],
        summary: 'Accept the current offer',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'influencerId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { required: false, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcceptOfferBody' } } } },
        responses: { 200: { description: 'Offer accepted' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Scripts
    // ═══════════════════════════════════════════════════════════════════════
    '/campaigns/{campaignId}/scripts': {
      get: {
        tags: ['Scripts'],
        summary: 'List all scripts for a campaign (brand_owner or admin)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Scripts', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Script' } }) } } },
          ...standardErrors,
        },
      },
      post: {
        tags: ['Scripts'],
        summary: 'Submit a script (influencer, multipart/form-data)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } },
        },
        responses: { 201: { description: 'Script submitted', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/Script' } as any) } } }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/scripts/mine': {
      get: {
        tags: ['Scripts'],
        summary: 'Get my submitted scripts for a campaign (influencer)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'My scripts', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Script' } }) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/scripts/{scriptId}/approve': {
      post: {
        tags: ['Scripts'],
        summary: 'Approve a script (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'scriptId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Approved' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/scripts/{scriptId}/revise': {
      post: {
        tags: ['Scripts'],
        summary: 'Request script revision (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'scriptId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] } } },
        },
        responses: { 200: { description: 'Revision requested' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Submissions
    // ═══════════════════════════════════════════════════════════════════════
    '/campaigns/{campaignId}/submissions': {
      get: {
        tags: ['Submissions'],
        summary: 'List all submissions for a campaign (brand_owner or admin)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Submissions', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Submission' } }) } } },
          ...standardErrors,
        },
      },
      post: {
        tags: ['Submissions'],
        summary: 'Submit final work (influencer, multipart/form-data)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } },
        },
        responses: { 201: { description: 'Submission created', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/Submission' } as any) } } }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/submissions/mine': {
      get: {
        tags: ['Submissions'],
        summary: 'Get my submissions for a campaign (influencer)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'My submissions', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Submission' } }) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/submissions/{subId}/approve': {
      post: {
        tags: ['Submissions'],
        summary: 'Approve a submission (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'subId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Approved' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/submissions/{subId}/reject': {
      post: {
        tags: ['Submissions'],
        summary: 'Reject a submission (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'subId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: { note: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Rejected' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Payments
    // ═══════════════════════════════════════════════════════════════════════
    '/payments/webhook/cashfree': {
      post: {
        tags: ['Payments'],
        summary: 'Cashfree payment webhook (no auth, signature-verified)',
        description: 'Received directly from Cashfree. Verified via HMAC signature on the raw body.',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'Cashfree webhook payload' } } } },
        responses: { 200: { description: 'Webhook processed' } },
      },
    },
    '/campaigns/{campaignId}/payment': {
      post: {
        tags: ['Payments'],
        summary: 'Initiate a payment round for accepted influencers (brand_owner or admin)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InitiatePaymentBody' } } } },
        responses: {
          201: { description: 'Payment round created with Cashfree order', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/PaymentRound' } as any) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/payment/verify': {
      post: {
        tags: ['Payments'],
        summary: 'Verify Cashfree payment after client-side redirect (brand_owner or admin)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyPaymentBody' } } } },
        responses: { 200: { description: 'Payment verified' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/payment/summary': {
      get: {
        tags: ['Payments'],
        summary: 'Get payment summary for a campaign (brand_owner or admin)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Payment summary',
            content: {
              'application/json': {
                schema: SuccessResponse({
                  type: 'object',
                  properties: {
                    rounds: { type: 'array', items: { $ref: '#/components/schemas/PaymentRound' } },
                    totalPaid: { type: 'number' },
                    eligibleCount: { type: 'integer' },
                  },
                }),
              },
            },
          },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/payment/reconcile': {
      post: {
        tags: ['Payments'],
        summary: 'Reconcile stuck influencers after a captured payment (brand_owner or admin)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Reconciliation complete' }, ...standardErrors },
      },
    },
    '/campaigns/{campaignId}/payment/{paymentId}': {
      get: {
        tags: ['Payments'],
        summary: 'Get payment round details (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'paymentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Payment round', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/PaymentRound' } as any) } } },
          ...standardErrors,
        },
      },
    },
    '/campaigns/{campaignId}/payment/{paymentId}/cancel': {
      patch: {
        tags: ['Payments'],
        summary: 'Cancel a pending payment round (brand_owner or admin)',
        parameters: [
          { name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'paymentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Cancelled' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Invoice
    // ═══════════════════════════════════════════════════════════════════════
    '/campaigns/{campaignId}/invoice/send': {
      post: {
        tags: ['Invoice'],
        summary: 'Generate and email PDF invoice to influencer and brand (influencer or admin)',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Invoice PDF sent by email and returned as binary download',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          ...standardErrors,
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Notifications
    // ═══════════════════════════════════════════════════════════════════════
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List notifications for the current user',
        parameters: paginationParams,
        responses: {
          200: {
            description: 'Notifications with unread count',
            content: {
              'application/json': {
                schema: SuccessResponse({
                  type: 'object',
                  properties: {
                    notifications: { type: 'array', items: { $ref: '#/components/schemas/Notification' } },
                    unreadCount: { type: 'integer' },
                  },
                }, true),
              },
            },
          },
          ...standardErrors,
        },
      },
    },
    '/notifications/send-test': {
      post: {
        tags: ['Notifications'],
        summary: 'Send a test push notification',
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: { userId: { type: 'string', format: 'uuid', description: 'Admin can specify another user' } } } } },
        },
        responses: { 200: { description: 'Test notification sent' }, ...standardErrors },
      },
    },
    '/notifications/read-all': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        responses: { 200: { description: 'All marked as read' }, ...standardErrors },
      },
    },
    '/notifications/register-token': {
      post: {
        tags: ['Notifications'],
        summary: 'Register a device push token (FCM)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token'],
                properties: {
                  token: { type: 'string', description: 'FCM device token' },
                  platform: { type: 'string', enum: ['ios', 'android'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Token registered' }, ...standardErrors },
      },
    },
    '/notifications/{id}/read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark a single notification as read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Marked as read' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Messages
    // ═══════════════════════════════════════════════════════════════════════
    '/messages/start': {
      post: {
        tags: ['Messages'],
        summary: 'Start a new conversation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['recipientId'],
                properties: {
                  recipientId: { type: 'string', format: 'uuid' },
                  initialMessage: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Conversation started', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/Conversation' } as any) } } },
          ...standardErrors,
        },
      },
    },
    '/messages': {
      get: {
        tags: ['Messages'],
        summary: 'List conversations for current user',
        parameters: paginationParams,
        responses: {
          200: { description: 'Conversations', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Conversation' } }, true) } } },
          ...standardErrors,
        },
      },
    },
    '/messages/{id}': {
      get: {
        tags: ['Messages'],
        summary: 'Get messages in a conversation',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ...paginationParams,
        ],
        responses: {
          200: { description: 'Messages', content: { 'application/json': { schema: SuccessResponse({ type: 'array', items: { $ref: '#/components/schemas/Message' } }, true) } } },
          ...standardErrors,
        },
      },
      post: {
        tags: ['Messages'],
        summary: 'Send a message in a conversation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } } },
        },
        responses: {
          201: { description: 'Message sent', content: { 'application/json': { schema: SuccessResponse({ $ref: '#/components/schemas/Message' } as any) } } },
          ...standardErrors,
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Analytics
    // ═══════════════════════════════════════════════════════════════════════
    '/analytics/overview': {
      get: {
        tags: ['Analytics'],
        summary: 'Get platform/user analytics overview',
        responses: {
          200: { description: 'Analytics overview', content: { 'application/json': { schema: SuccessResponse({ type: 'object' }) } } },
          ...standardErrors,
        },
      },
    },
    '/analytics/campaigns/{campaignId}': {
      get: {
        tags: ['Analytics'],
        summary: 'Get analytics for a specific campaign',
        parameters: [{ name: 'campaignId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Campaign analytics', content: { 'application/json': { schema: SuccessResponse({ type: 'object' }) } } },
          ...standardErrors,
        },
      },
    },
    '/analytics/content': {
      get: {
        tags: ['Analytics'],
        summary: 'Content analytics (coming soon)',
        responses: {
          200: { description: 'Content analytics (placeholder — not yet implemented)', content: { 'application/json': { schema: SuccessResponse({ type: 'object' }) } } },
          ...standardErrors,
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // AI
    // ═══════════════════════════════════════════════════════════════════════
    '/ai/strategist': {
      post: {
        tags: ['AI'],
        summary: 'AI campaign strategist (SSE streaming response)',
        description: 'Returns a **Server-Sent Events** stream. Connect with `EventSource` or handle the `text/event-stream` response manually.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StrategistBody' } } } },
        responses: {
          200: {
            description: 'SSE stream of strategy chunks',
            content: { 'text/event-stream': { schema: { type: 'string', description: 'Newline-delimited SSE events: data: <chunk>\\n\\n' } } },
          },
          ...standardErrors,
        },
      },
    },
    '/ai/smart-select': {
      post: {
        tags: ['AI'],
        summary: 'AI smart influencer selection for a campaign (brand_owner or admin)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SmartSelectBody' } } } },
        responses: {
          200: {
            description: 'Recommended influencers',
            content: {
              'application/json': {
                schema: SuccessResponse({
                  type: 'object',
                  properties: {
                    influencers: { type: 'array', items: { $ref: '#/components/schemas/InfluencerProfile' } },
                    reasoning: { type: 'string' },
                  },
                }),
              },
            },
          },
          ...standardErrors,
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Reports
    // ═══════════════════════════════════════════════════════════════════════
    '/reports': {
      post: {
        tags: ['Reports'],
        summary: 'Report a brand or influencer',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateReportBody' } } } },
        responses: { 201: { description: 'Report submitted' }, ...standardErrors },
      },
    },
    '/reports/blocks': {
      post: {
        tags: ['Reports'],
        summary: 'Block a brand or influencer',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBlockBody' } } } },
        responses: { 201: { description: 'User blocked' }, ...standardErrors },
      },
    },
    '/reports/blocks/{targetId}': {
      delete: {
        tags: ['Reports'],
        summary: 'Unblock a brand or influencer',
        parameters: [{ name: 'targetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'User unblocked' }, ...standardErrors },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Uploads
    // ═══════════════════════════════════════════════════════════════════════
    '/uploads/{key}': {
      get: {
        tags: ['Uploads'],
        summary: 'Proxy-serve a file from S3 by its storage key',
        description: 'Streams the file from S3. Sets appropriate `Content-Type` and caching headers. Requires authentication.',
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' }, description: 'S3 object key (e.g. avatars/abc123.jpg)', example: 'avatars/abc123.jpg' }],
        responses: {
          200: { description: 'File stream', content: { '*/*': { schema: { type: 'string', format: 'binary' } } } },
          404: notFoundResponse,
          401: unauthorizedResponse,
        },
      },
    },
  },
};
