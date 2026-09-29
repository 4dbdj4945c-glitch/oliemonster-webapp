import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';

export const GET = withAuth({ rol: 'admin', module: 'beheer', adminMelding: 'Alleen admins kunnen audit logs bekijken' }, async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const username = searchParams.get('username');
    const limit = parseInt(searchParams.get('limit') || '100');

    const where: any = {};
    if (action) where.action = action;
    if (username) where.username = { contains: username, mode: 'insensitive' };

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500), // Max 500 logs
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen van audit logs' },
      { status: 500 }
    );
  }
});
