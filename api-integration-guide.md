# Mutiny Maker — API & Frontend Integration Guide

This guide provides frontend developers with everything needed to connect to the Mutiny Maker Node.js backend.

## 1. Connection Basics

### Base URL
All REST API endpoints are prefixed with `/api/v1`.
Local development: `http://localhost:3000/api/v1` (or whatever `PORT` is defined in the backend `.env`).

### Authentication
The backend uses **JWT (JSON Web Tokens)** for authentication.

- **Login/Register** endpoints return an `accessToken` and a `refreshToken`.
- **Protected Routes:** Send the `accessToken` in the `Authorization` header for all protected API calls.
  ```http
  Authorization: Bearer <accessToken>
  ```
- **Token Expiry:** When the access token expires (usually 15 minutes), use the `/auth/refresh` endpoint with your `refreshToken` to get a new one.

### Error Handling
All responses follow a consistent envelope structure:
```json
// Success
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 10, "total": 50 } }

// Error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Campaign not found" } }
```

---

## 2. REST API Endpoints

### Auth Routes (Public)
- `POST /auth/register` - Create user. Body: `{ email, password, name, role }`
- `POST /auth/login` - Authenticate. Body: `{ email, password }`
- `POST /auth/refresh` - Refresh access token. Body: `{ refreshToken }`
- `POST /auth/logout` - Invalidate refresh token. Body: `{ refreshToken }`
- `GET /auth/me` - Get current user profile (Protected).

### Brand Profile
- `GET /brand/profile` - Get own brand profile
- `PUT /brand/profile` - Update brand profile
- `POST /brand/profile/avatar` - Upload brand logo (multipart/form-data)

### Campaigns
- `GET /campaigns` - List campaigns. Query params: `status`, `type`, `visibility`, `page`, `limit`, `sort`.
- `POST /campaigns` - Create new campaign (starts as 'draft').
- `GET /campaigns/:id` - Get campaign details.
- `PUT /campaigns/:id` - Update campaign.
- `DELETE /campaigns/:id` - Soft delete campaign.
- `POST /campaigns/:id/launch` - Change status to 'active'.
- `POST /campaigns/:id/close` - Change status to 'closed'.

### Applications 
- `GET /campaigns/:campaignId/applications` - List all applied/invited influencers.
- `POST /campaigns/:campaignId/applications/:appId/approve` - Accept an application (enables chat).
- `POST /campaigns/:campaignId/applications/:appId/reject` - Reject an application.

### Negotiation
- `GET /campaigns/:campaignId/negotiation/:influencerId` - Get full negotiation history.
- `POST /campaigns/:campaignId/negotiation/:influencerId/accept` - Finalize negotiation (Body: `{ amount }`).
- `POST /campaigns/:campaignId/negotiation/:influencerId/counter` - Counter-offer (Body: `{ amount, note }`).

### Payments
- `POST /campaigns/:campaignId/payment` - Initiate payment via gateway (Razorpay). Body: `{ influencerId, type: 'first' | 'final' }`. Returns `{ orderId, amount, currency, gatewayKey }`.
- `GET /campaigns/:campaignId/payment/status` - Current payment status.

### Scripts & Submissions
- `GET /campaigns/:campaignId/scripts` - List influencer script submissions.
- `POST /campaigns/:campaignId/scripts/:scriptId/approve` - Approve a script.
- `POST /campaigns/:campaignId/scripts/:scriptId/revise` - Request revision. Body: `{ reviewNote }`.
- `GET /campaigns/:campaignId/submissions` - List final work submissions.
- `POST /campaigns/:campaignId/submissions/:subId/approve` - Approve final work.
- `POST /campaigns/:campaignId/submissions/:subId/reject` - Reject final work. Body: `{ reviewNote }`.

### Influencers (Discover)
- `GET /influencers/search` - Search influencers. Query params: `q`, `niche[]`, `tier[]`, `location`, `minFollowers`, `minEngagement`, etc.
- `GET /influencers/:id` - Get full influencer profile.
- `POST /influencers/invite` - Direct invite. Body: `{ influencerId, campaignId, message? }`.
- `POST /influencers/bulk-invite` - Bulk invite. Body: `{ influencerIds[], campaignId, message? }`.

### Messages & Chat
- `GET /messages` - List all conversations with unread counts.
- `GET /messages/:conversationId` - Get paginated messages for a conversation.
- `POST /messages/:conversationId` - Send a message. Body: `{ content }`.

### Notifications & Analytics
- `GET /notifications` - List notifications. Query params: `page`, `limit`, `unreadOnly`.
- `POST /notifications/:id/read` - Mark as read.
- `POST /notifications/read-all` - Mark all as read.
- `GET /analytics/overview` - Aggregated platform stats.
- `GET /analytics/campaigns/:campaignId` - Per-campaign stats.

### AI Strategist
- `POST /ai/strategist` - Stream AI response (SSE). Body: `{ campaignId?, messages: [{role, content}] }`.

---

## 3. WebSocket Integration (Real-time)

To subscribe to real-time events (chat, notifications, campaign updates), use `socket.io-client`.

### Setup connection
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'YOUR_ACCESS_TOKEN' // Must send JWT for authentication
  }
});

socket.on('connect', () => {
  console.log('Connected to WS:', socket.id);
});
```

### Joining Rooms
When a user views a specific campaign, they should join its room to get live updates.
```javascript
// Client -> Server
socket.emit('JOIN_CAMPAIGN', campaignId);
socket.emit('LEAVE_CAMPAIGN', campaignId);
```

### Events Received Across the App
Listen to these events to update your frontend stores/UI dynamically:

| Event | Payload | Use case |
|-------|---------|----------|
| `NOTIFICATION` | `Notification` object | Global system notifications, badge counts |
| `CAMPAIGN_UPDATE` | `{ campaignId, status, field }` | Refresh campaign detail page |
| `CHAT_MESSAGE` | `Message` object | Append to chat UI |
| `APPLICATION_RECEIVED`| `{ campaignId, influencer }` | Refresh applications tab |
| `SCRIPT_SUBMITTED` | `{ campaignId, influencerId, scriptId }` | Show new script for review |
| `WORK_SUBMITTED` | `{ campaignId, influencerId, submissionId }` | Show final work for review |
| `NEGOTIATION_UPDATE`| `{ campaignId, influencerId, entry }` | Refresh negotiation timeline |
| `PAYMENT_STATUS` | `{ campaignId, influencerId, status }` | Refresh payment milestones status |

---

## 4. File Uploads
Files (images, scripts, videos) should be uploaded via `multipart/form-data` to `/brand/profile/avatar` (or respective endpoints). 

Images and files will be served statically from the backend at `/files/...` (e.g., `http://localhost:3000/files/avatars/12345.jpg`).
