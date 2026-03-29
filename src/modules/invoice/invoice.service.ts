import PDFDocument from 'pdfkit';
import { db } from '@/db';
import {
  campaignInfluencers,
  campaigns,
  influencerProfiles,
  brandProfiles,
  users,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { NotFoundError, BadRequestError } from '@/shared/errors';
import { sendEmail } from '@/shared/utils/email';

// ─── PDF Generation ──────────────────────────────────────────────────────────

function fmtAmount(val: string | number | null | undefined): string {
  if (val == null) return '—';
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface InvoiceData {
  invoiceNumber: string;
  campaignName: string;
  brandName: string;
  influencerName: string;
  influencerHandle: string | null;
  platform: string | null;
  agreedBudget: string | null;
  tierRate: string | null;
  platformFee: string | null;
  status: string;
  appliedAt: Date | null;
  acceptedAt: Date | null;
  completedAt: Date | null;
  settledAt: Date | null;
  briefSummary: string | null;
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PRIMARY = '#FFD700';
    const DARK = '#111111';
    const GRAY = '#6B7280';
    const LIGHT_GRAY = '#F3F4F6';
    const PAGE_WIDTH = doc.page.width - 100; // margins

    // ── Header bar ────────────────────────────────────────────────────────────
    doc.rect(50, 40, PAGE_WIDTH, 70).fill(DARK);

    doc.fillColor(PRIMARY).fontSize(22).font('Helvetica-Bold')
      .text('MUTINY', 65, 58, { continued: true })
      .fillColor('#FFFFFF').font('Helvetica')
      .text(' Talent');

    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica')
      .text('Campaign Invoice', PAGE_WIDTH - 20, 58, { align: 'right', width: 160 });

    // ── Invoice meta ──────────────────────────────────────────────────────────
    doc.fillColor(DARK).fontSize(9).font('Helvetica')
      .text(`Invoice No: #${data.invoiceNumber}`, 50, 130)
      .text(`Generated: ${fmtDate(new Date())}`, 50, 145);

    // ── Campaign + brand block ────────────────────────────────────────────────
    doc.rect(50, 170, PAGE_WIDTH, 1).fill(LIGHT_GRAY);

    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold')
      .text('CAMPAIGN', 50, 185)
      .text('BRAND', 250, 185);

    doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
      .text(data.campaignName, 50, 200, { width: 190 });

    doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
      .text(data.brandName, 250, 200, { width: 190 });

    if (data.platform) {
      doc.fillColor(GRAY).fontSize(9).font('Helvetica')
        .text(`Platform: ${data.platform}`, 50, 230);
    }

    // ── Influencer block ──────────────────────────────────────────────────────
    doc.rect(50, 255, PAGE_WIDTH, 1).fill(LIGHT_GRAY);

    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold')
      .text('INFLUENCER', 50, 270);

    doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
      .text(data.influencerName, 50, 285);

    if (data.influencerHandle) {
      doc.fillColor(GRAY).fontSize(9).font('Helvetica')
        .text(`@${data.influencerHandle}`, 50, 305);
    }

    // ── Financial breakdown ───────────────────────────────────────────────────
    doc.rect(50, 330, PAGE_WIDTH, 1).fill(LIGHT_GRAY);

    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold')
      .text('FINANCIALS', 50, 345);

    const budget = Number(data.agreedBudget ?? data.tierRate ?? 0);
    const fee = Number(data.platformFee ?? 0);
    const net = budget > 0 ? budget - fee : 0;

    const rows: Array<[string, string, boolean?]> = [
      ['Agreed Budget', fmtAmount(budget)],
      ['Platform Fee', fee > 0 ? `-${fmtAmount(fee)}` : '—'],
      ['Net Payout', fmtAmount(net > 0 ? net : budget), true],
    ];

    let rowY = 360;
    for (const [label, value, bold] of rows) {
      doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(label, 50, rowY);
      doc.fillColor(DARK).fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(value, 350, rowY, { align: 'right', width: 160 });
      rowY += 20;
    }

    // Net payout highlighted box
    doc.rect(50, rowY, PAGE_WIDTH, 36).fill(PRIMARY);
    doc.fillColor(DARK).fontSize(10).font('Helvetica')
      .text('TOTAL PAYOUT', 65, rowY + 13);
    doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold')
      .text(fmtAmount(net > 0 ? net : budget), 350, rowY + 10, { align: 'right', width: 155 });

    rowY += 56;

    // ── Timeline ──────────────────────────────────────────────────────────────
    doc.rect(50, rowY, PAGE_WIDTH, 1).fill(LIGHT_GRAY);
    rowY += 15;

    doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold')
      .text('TIMELINE', 50, rowY);
    rowY += 15;

    const timeline: Array<[string, Date | null | undefined]> = [
      ['Applied', data.appliedAt],
      ['Accepted', data.acceptedAt],
      ['Completed', data.completedAt],
      ['Settled', data.settledAt],
    ];

    for (const [label, date] of timeline) {
      if (!date) continue;
      doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(`${label}:`, 50, rowY);
      doc.fillColor(DARK).fontSize(9).font('Helvetica').text(fmtDate(date), 130, rowY);
      rowY += 16;
    }

    rowY += 10;

    // Status pill
    const statusColors: Record<string, string> = {
      settled: '#22C55E',
      completed: '#22C55E',
      paid: '#22C55E',
      payment_pending: '#F59E0B',
      work_review: '#F59E0B',
      work_pending: '#F97316',
    };
    const statusColor = statusColors[data.status] ?? GRAY;

    doc.rect(50, rowY, PAGE_WIDTH, 28).fill(LIGHT_GRAY);
    doc.fillColor(statusColor).fontSize(10).font('Helvetica-Bold')
      .text(`Status: ${data.status.replace(/_/g, ' ').toUpperCase()}`, 65, rowY + 9);

    rowY += 48;

    // ── Brief summary (optional) ──────────────────────────────────────────────
    if (data.briefSummary) {
      doc.rect(50, rowY, PAGE_WIDTH, 1).fill(LIGHT_GRAY);
      rowY += 15;

      doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('BRIEF', 50, rowY);
      rowY += 14;

      doc.fillColor(DARK).fontSize(9).font('Helvetica')
        .text(data.briefSummary.slice(0, 400), 50, rowY, { width: PAGE_WIDTH, lineGap: 4 });

      rowY += Math.min(80, data.briefSummary.length / 5);
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 70;
    doc.rect(50, footerY, PAGE_WIDTH, 1).fill(LIGHT_GRAY);
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
      .text('This invoice is auto-generated by Mutiny Talent. For queries: support@mutinytalent.com', 50, footerY + 10, {
        align: 'center',
        width: PAGE_WIDTH,
      });
    doc.fillColor(GRAY).fontSize(8)
      .text('© Mutiny Talent — Making creators unstoppable', 50, footerY + 25, {
        align: 'center',
        width: PAGE_WIDTH,
      });

    doc.end();
  });
}

// ─── Email sending ────────────────────────────────────────────────────────────

async function sendInvoiceEmail(
  to: string,
  name: string,
  campaignName: string,
  pdfBuffer: Buffer,
  invoiceNumber: string,
) {
  const subject = `Invoice #${invoiceNumber} — ${campaignName}`;
  const html = `
    <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #111111;">Campaign Invoice</h2>
        <p>Hi ${name},</p>
        <p>Please find the invoice for the campaign <strong>${campaignName}</strong> attached to this email.</p>
        <p>Invoice Number: <strong>#${invoiceNumber}</strong></p>
        <br/>
        <p style="color: #666;">Thanks,<br/>Mutiny Talent Team</p>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject,
    html,
    attachments: [{ filename: `invoice-${invoiceNumber}.pdf`, content: pdfBuffer }],
  });
}

// ─── Main service function ────────────────────────────────────────────────────

export async function sendCampaignInvoice(campaignId: string, influencerUserId: string) {
  // Fetch all necessary data in one join
  const [row] = await db
    .select({
      ci: {
        id: campaignInfluencers.id,
        status: campaignInfluencers.status,
        agreedBudget: campaignInfluencers.agreedBudget,
        tierRate: campaignInfluencers.tierRate,
        platformFee: campaignInfluencers.platformFee,
        appliedAt: campaignInfluencers.appliedAt,
        acceptedAt: campaignInfluencers.acceptedAt,
        completedAt: campaignInfluencers.completedAt,
        settledAt: campaignInfluencers.settledAt,
      },
      campaign: {
        name: campaigns.name,
        platform: campaigns.platform,
        brief: campaigns.brief,
      },
      brand: {
        brandName: brandProfiles.brandName,
        userId: brandProfiles.userId,
      },
      influencer: {
        handle: influencerProfiles.handle,
      },
      influencerUser: {
        name: users.name,
        email: users.email,
      },
    })
    .from(campaignInfluencers)
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(influencerProfiles.userId, influencerUserId),
      )
    )
    .limit(1);

  if (!row) throw new NotFoundError('Campaign application not found');

  const allowedStatuses = [
    'accepted', 'payment_pending', 'paid',
    'script_pending', 'script_review',
    'work_pending', 'work_review',
    'completed', 'settled',
  ];

  if (!allowedStatuses.includes(row.ci.status)) {
    throw new BadRequestError('Invoice is only available after your application is accepted.');
  }

  // Fetch brand user email
  const [brandUser] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, row.brand.userId))
    .limit(1);

  const invoiceNumber = row.ci.id.replace(/-/g, '').slice(0, 10).toUpperCase();

  const invoiceData: InvoiceData = {
    invoiceNumber,
    campaignName: row.campaign.name,
    brandName: row.brand.brandName,
    influencerName: row.influencerUser.name,
    influencerHandle: row.influencer.handle,
    platform: row.campaign.platform,
    agreedBudget: row.ci.agreedBudget,
    tierRate: row.ci.tierRate,
    platformFee: row.ci.platformFee,
    status: row.ci.status,
    appliedAt: row.ci.appliedAt,
    acceptedAt: row.ci.acceptedAt,
    completedAt: row.ci.completedAt,
    settledAt: row.ci.settledAt,
    briefSummary: row.campaign.brief,
  };

  const pdfBuffer = await generateInvoicePdf(invoiceData);

  // Email influencer
  if (row.influencerUser.email) {
    await sendInvoiceEmail(
      row.influencerUser.email,
      row.influencerUser.name,
      row.campaign.name,
      pdfBuffer,
      invoiceNumber,
    );
  }

  // Email brand
  if (brandUser?.email) {
    await sendInvoiceEmail(
      brandUser.email,
      brandUser.name,
      row.campaign.name,
      pdfBuffer,
      invoiceNumber,
    );
  }

  return {
    invoiceNumber,
    campaignName: row.campaign.name,
    emailedTo: [row.influencerUser.email, brandUser?.email].filter(Boolean),
    pdfBuffer,
  };
}
