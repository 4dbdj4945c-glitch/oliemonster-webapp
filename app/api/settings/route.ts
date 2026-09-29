import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';

// GET - Haal alle settings op
// Ook de rol alleen lezen mag de instellingen lezen: de kolominstellingen van de
// oliemonsterlijst staan hierin. Wijzigen kan alleen een admin.
export const GET = withAuth({ rol: 'alleen_lezen', module: 'oliemonsters' }, async () => {
  try {
    const settings = await prisma.settings.findMany();
    
    // Convert naar object format
    const settingsObj: Record<string, unknown> = {};
    settings.forEach(setting => {
      try {
        settingsObj[setting.key] = JSON.parse(setting.value);
      } catch {
        settingsObj[setting.key] = setting.value;
      }
    });

    return NextResponse.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen instellingen' },
      { status: 500 }
    );
  }
});

// POST - Update settings (alleen admin)
export const POST = withAuth({ rol: 'admin', module: 'beheer', adminMelding: 'Geen toegang' }, async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return NextResponse.json(
        { error: 'Key is verplicht' },
        { status: 400 }
      );
    }

    // Save or update setting
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    const setting = await prisma.settings.upsert({
      where: { key },
      update: { value: stringValue },
      create: { key, value: stringValue },
    });

    return NextResponse.json({ 
      success: true, 
      key: setting.key,
      value: JSON.parse(setting.value)
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Fout bij opslaan instellingen' },
      { status: 500 }
    );
  }
});
