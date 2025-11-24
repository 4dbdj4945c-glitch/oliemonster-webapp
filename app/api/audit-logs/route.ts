import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Alleen admins kunnen audit logs bekijken' },
        { status: 403 }
      );
    }

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
}
