import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if Blob token is configured
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.' },
        { status: 500 }
      );
    }

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

    // Upload to Vercel Blob storage
    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const filename = `sample-${id}-${timestamp}.${extension}`;

    const blob = await put(filename, file, {
      access: 'public',
    });

    // Update database with photo URL
    const photoUrl = blob.url;
    await prisma.oilSample.update({
      where: { id: parseInt(id) },
      data: { photoUrl },
    });

    return NextResponse.json({ photoUrl });
  } catch (error) {
    console.error('Error uploading photo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Fout bij uploaden van foto';
    return NextResponse.json(
      { error: errorMessage },
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
