import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('photo') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'Geen foto gevonden' },
        { status: 400 }
      );
    }

    // Check if sample exists
    const sample = await prisma.oilSample.findUnique({
      where: { id: parseInt(id) },
    });

    if (!sample) {
      return NextResponse.json(
        { error: 'Monster niet gevonden' },
        { status: 404 }
      );
    }

    // Create uploads directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'public', 'uploads');
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const filename = `sample-${id}-${timestamp}.${extension}`;
    const filepath = join(uploadDir, filename);

    // Convert file to buffer and write to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Update database with photo URL
    const photoUrl = `/uploads/${filename}`;
    await prisma.oilSample.update({
      where: { id: parseInt(id) },
      data: { photoUrl },
    });

    return NextResponse.json({ photoUrl });
  } catch (error) {
    console.error('Error uploading photo:', error);
    return NextResponse.json(
      { error: 'Fout bij uploaden van foto' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sample = await prisma.oilSample.findUnique({
      where: { id: parseInt(id) },
    });

    if (!sample) {
      return NextResponse.json(
        { error: 'Monster niet gevonden' },
        { status: 404 }
      );
    }

    // Remove photo URL from database
    await prisma.oilSample.update({
      where: { id: parseInt(id) },
      data: { photoUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return NextResponse.json(
      { error: 'Fout bij verwijderen van foto' },
      { status: 500 }
    );
  }
}
