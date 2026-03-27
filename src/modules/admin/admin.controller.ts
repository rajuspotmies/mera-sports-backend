import type { Request, Response } from 'express';
import * as adminService from './admin.service';
import { sendSuccess } from '@/shared/utils/response';

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardStatsHandler(req: Request, res: Response) {
  const result = await adminService.getDashboardStats();
  sendSuccess(res, result);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function listUsersHandler(req: Request, res: Response) {
  const { users, meta } = await adminService.listUsers(req.query as never);
  sendSuccess(res, users, 200, meta);
}

export async function getUserDetailHandler(req: Request, res: Response) {
  const result = await adminService.getUserDetail(req.params.id);
  sendSuccess(res, result);
}

export async function updateUserStatusHandler(req: Request, res: Response) {
  const result = await adminService.updateUserStatus(req.params.id, req.body);
  sendSuccess(res, result);
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function listAdminCampaignsHandler(req: Request, res: Response) {
  const { campaigns, meta } = await adminService.listAdminCampaigns(req.query as never);
  sendSuccess(res, campaigns, 200, meta);
}

export async function getAdminCampaignDetailHandler(req: Request, res: Response) {
  const result = await adminService.getAdminCampaignDetail(req.params.id);
  sendSuccess(res, result);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function listReportsHandler(req: Request, res: Response) {
  const { reports, meta } = await adminService.listAdminReports(req.query as never);
  sendSuccess(res, reports, 200, meta);
}

export async function resolveReportHandler(req: Request, res: Response) {
  const result = await adminService.resolveReport(req.user.sub, req.params.id);
  sendSuccess(res, result);
}

// ─── Bank Details ─────────────────────────────────────────────────────────────

export async function getInfluencerBankDetailsHandler(req: Request, res: Response) {
  const result = await adminService.getInfluencerBankDetails(req.params.influencerUserId);
  sendSuccess(res, result);
}
