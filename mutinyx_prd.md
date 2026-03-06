# MutinyX — Product Requirements Document (Synthesized)

## 1. Executive Summary
**MutinyX** is a comprehensive B2B influencer marketing platform designed to bridge the gap between brands and creators. It streamlines the entire campaign lifecycle, from discovery and negotiation to content approval and automated payments.

## 2. Target Audience
*   **Brands/Marketers:** Users who want to discover creators, manage campaigns at scale, and track ROI.
*   **Creators (via MutinyTalent):** Influencers who need a streamlined way to apply for jobs, manage deliverables, and get paid promptly.

## 3. Core Modules & Features

### A. Creator Discovery & Marketplace
*   **Filters:** Platform (IG, YT, TikTok, X, Pinterest), Niche, Demographics, Follower Count.
*   **Profiles:** Engagement rates, audience quality, cost estimates, and authenticity scores.
*   **Direct Connect:** In-app messaging for direct brand-creator communication.

### B. Campaign Management
*   **AI Strategy Mode:** Automated campaign planning and creator suggestions.
*   **Step-by-Step Builder:** Manual creation wizard (Basics → Deliverables → Budget → Preview).
*   **Tracking Module:** Structured approval workflow including Script/Concept, Draft Content, Final Content, and Verified Posting.

### C. Financials & Analytics
*   **Analytics:** Real-time metrics for Impressions, Reach, CPE, and ROAS.
*   **Two-Phase Payments:** 50% upfront upon acceptance, 50% upon final work approval.
*   **Invoice Generation:** Automated invoice creation for creators.

## 4. Technical Requirements & Architecture
*   **Web Portal:** React-based dashboard for brand owners (MutinyX).
*   **Mobile App:** Dedicated app for creators (MutinyTalent).
*   **Real-time Infrastructure:** Socket.io for notifications, chat, and status updates.
*   **Scalable API:** RESTful API for all data operations.

## 5. Campaign Lifecycle (Detailed Flow)
1.  **Creation:** Brand builds and launches campaign.
2.  **Discovery:** Brand invites creators OR creators apply.
3.  **Negotiation:** Agreed rates through counter-offers.
4.  **Payment 1:** Brand pays 50% upfront.
5.  **Execution (Script):** Script submission and revision loop.
6.  **Execution (Work):** Content submission and approval.
7.  **Payment 2:** Brand/Admin releases final 50%.
8.  **Closure:** Campaign archived and analytics finalized.

## 6. Success Metrics
*   **Campaign Velocity:** Reducing time from creation to first post.
*   **Creator Retention:** High volume of repeat collaborations.
*   **ROI Accuracy:** Direct correlation between spend and reach/engagement.
