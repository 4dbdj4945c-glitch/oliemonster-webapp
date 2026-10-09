import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiRoute, ApiFout } from './apiRoute';
import { ChatAdminFout } from './chatAdmin';
import { createAuditLog } from './auditLog';
import type { Sessie } from './toegang';

export function chatbotRoute(handler: (request: NextRequest, context: unknown, sessie: Sessie) => Promise<Response>) {
  return apiRoute({ rol: 'admin', module: 'chatbot', adminMelding: 'Alleen beheerders hebben toegang tot de chatbot.', fout: 'De chatbot kon het verzoek niet verwerken.' }, async (request, context, sessie) => {
    try { return await handler(request, context, sessie); }
    catch (error) {
      if (error instanceof ChatAdminFout) throw new ApiFout(error.status, error.message);
      throw error;
    }
  });
}
export async function gesprekId(context: unknown) {
  const params = await (context as { params: Promise<{ id: string }> }).params;
  return z.uuid({ error: 'Ongeldig gespreknummer' }).parse(params.id);
}
export const chatAntwoord = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function chatAudit(request: NextRequest, sessie: Sessie, action: string, details?: unknown) {
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action, details, request });
}
