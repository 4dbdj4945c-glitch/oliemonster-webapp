import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { foutAntwoord } from '@/lib/prospectApi';
import { schrijfProspectsCsv } from '@/lib/prospectCsv';

// GET - Alle prospects als CSV. Met ?archief=1 komt het archief mee.
export const GET = withAuth({ rol: 'user', module: 'acquisitie' }, async (request: NextRequest, _context, session) => {
  try {
    const { searchParams } = new URL(request.url);
    const metArchief = searchParams.get('archief') === '1';

    const prospects = await prisma.prospect.findMany({
      where: metArchief ? {} : { archief: false },
      orderBy: [{ bedrijfsnaam: 'asc' }],
    });

    const csv = schrijfProspectsCsv(prospects);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.EXPORT_PROSPECTS,
      details: { aantal: prospects.length, metArchief },
      request,
    });

    const vandaag = new Date().toISOString().slice(0, 10);

    // BOM erbij, anders maakt Excel er rommel van bij accenten.
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="prospects-${vandaag}.csv"`,
      },
    });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij exporteren van prospects');
  }
});
