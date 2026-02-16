import { prisma } from './prisma';
import { NextRequest } from 'next/server';

export async function createAuditLog({
  userId,
  username,
  action,
  details,
  request,
  success = true,
}: {
  userId?: number;
  username: string;
  action: string;
  details?: any;
  request?: NextRequest;
  success?: boolean;
}) {
  try {
    const ipAddress = request?.headers.get('x-forwarded-for') || 
                     request?.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request?.headers.get('user-agent') || 'unknown';

    await prisma.auditLog.create({
      data: {
        userId,
        username,
        action,
        details: details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent,
        success,
      },
    });
  } catch (error) {
    // Fail silently - we don't want audit log failures to break the app
    console.error('Failed to create audit log:', error);
  }
}

// Action types voor consistentie
export const AuditActions = {
  // Auth
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  
  // Samples
  CREATE_SAMPLE: 'CREATE_SAMPLE',
  UPDATE_SAMPLE: 'UPDATE_SAMPLE',
  DELETE_SAMPLE: 'DELETE_SAMPLE',
  VIEW_SAMPLES: 'VIEW_SAMPLES',
  
  // Photos
  UPLOAD_PHOTO: 'UPLOAD_PHOTO',
  DELETE_PHOTO: 'DELETE_PHOTO',
  VIEW_PHOTO: 'VIEW_PHOTO',
  
  // Users
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',
  CHANGE_PASSWORD: 'CHANGE_PASSWORD',
  
  // Settings
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  VIEW_SETTINGS: 'VIEW_SETTINGS',

  // Products (Voorraadbeheer)
  CREATE_PRODUCT: 'CREATE_PRODUCT',
  UPDATE_PRODUCT: 'UPDATE_PRODUCT',
  DELETE_PRODUCT: 'DELETE_PRODUCT',
  
  // Stock (Voorraadbeheer)
  STOCK_IN: 'STOCK_IN',
  STOCK_OUT: 'STOCK_OUT',
  
  // Contacts
  CREATE_CONTACT: 'CREATE_CONTACT',
  UPDATE_CONTACT: 'UPDATE_CONTACT',
  DELETE_CONTACT: 'DELETE_CONTACT',
  CREATE_CONTACT_NOTE: 'CREATE_CONTACT_NOTE',
  DELETE_CONTACT_NOTE: 'DELETE_CONTACT_NOTE',
} as const;
