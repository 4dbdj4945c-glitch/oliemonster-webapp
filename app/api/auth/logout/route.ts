import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    
    // Log logout voor sessie wordt vernietigd
    if (session.isLoggedIn) {
      await createAuditLog({
        userId: session.userId,
        username: session.username || 'unknown',
        action: AuditActions.LOGOUT,
        request,
      });
    }
    
    session.destroy();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Er is een fout opgetreden bij het uitloggen' },
      { status: 500 }
    );
  }
}
