import { after, type NextRequest } from 'next/server';
import { prisma } from './prisma';

/**
 * Schrijft een regel in het logboek. Binnen een verzoek gebeurt dat met
 * after() van Next.js: pas nadat het antwoord weg is, zodat niemand op het
 * logboek wacht (op Vercel loopt de functie daarvoor door tot het klaar is).
 * Buiten een verzoek (scripts, tests) gewoon meteen. Een mislukte regel breekt
 * nooit de actie zelf.
 */
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
  details?: unknown;
  request?: NextRequest;
  success?: boolean;
}) {
  // Alles wat van het verzoek komt nu al lezen, niet pas na het antwoord.
  let data;
  try {
    data = {
      userId,
      username,
      action,
      details: details ? JSON.stringify(details) : null,
      ipAddress: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || 'unknown',
      userAgent: request?.headers.get('user-agent') || 'unknown',
      success,
    };
  } catch (error) {
    console.error('Failed to create audit log:', error);
    return;
  }
  const schrijf = async () => {
    try {
      await prisma.auditLog.create({ data, select: { id: true } });
    } catch (error) {
      // Fail silently - we don't want audit log failures to break the app
      console.error('Failed to create audit log:', error);
    }
  };
  try {
    after(schrijf);
  } catch {
    // Geen verzoek om op te wachten (test of script): meteen schrijven.
    await schrijf();
  }
}

// Action types voor consistentie. De modules Controlerondes en
// Ultimo-opmerkingen zijn opgeheven (oktober 2026); hun regels
// (CREATE_CONTROL_ROUND, CREATE_ULTIMO_TASK en zo) blijven als historie in het
// logboek staan.
export const AuditActions = {
  // Auth
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  
  // Samples
  CREATE_SAMPLE: 'CREATE_SAMPLE',
  UPDATE_SAMPLE: 'UPDATE_SAMPLE',
  SET_SAMPLE_STATUS: 'SET_SAMPLE_STATUS',
  CANCEL_SAMPLE: 'CANCEL_SAMPLE',
  UNCANCEL_SAMPLE: 'UNCANCEL_SAMPLE',
  // Niet bereikbaar: het monster blijft openstaan en telt mee in de planning,
  // dus dit is bewust een eigen actie en niet een variant van annuleren.
  SET_SAMPLE_UNREACHABLE: 'SET_SAMPLE_UNREACHABLE',
  CLEAR_SAMPLE_UNREACHABLE: 'CLEAR_SAMPLE_UNREACHABLE',
  // Knop Monster nemen: datum, type olie, opmerking en beide foto's in één keer.
  TAKE_SAMPLE: 'TAKE_SAMPLE',
  // Verwijderen is zacht: het monster gaat naar de prullenbak en kan terug.
  DELETE_SAMPLE: 'DELETE_SAMPLE',
  RESTORE_SAMPLE: 'RESTORE_SAMPLE',
  // Afname ongedaan maken: de laatste poging terug naar niet genomen.
  UNDO_TAKE_SAMPLE: 'UNDO_TAKE_SAMPLE',
  COPY_SAMPLES: 'COPY_SAMPLES',
  VIEW_SAMPLES: 'VIEW_SAMPLES',
  
  // Photos
  UPLOAD_PHOTO: 'UPLOAD_PHOTO',
  DELETE_PHOTO: 'DELETE_PHOTO',
  VIEW_PHOTO: 'VIEW_PHOTO',

  // Sample Attempts (hermonstering)
  CREATE_ATTEMPT: 'CREATE_ATTEMPT',
  UPDATE_ATTEMPT: 'UPDATE_ATTEMPT',
  DELETE_ATTEMPT: 'DELETE_ATTEMPT',
  UPLOAD_ATTEMPT_PHOTO: 'UPLOAD_ATTEMPT_PHOTO',
  DELETE_ATTEMPT_PHOTO: 'DELETE_ATTEMPT_PHOTO',
  
  // Users
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',
  CHANGE_PASSWORD: 'CHANGE_PASSWORD',
  
  // Planning: objecten
  CREATE_SAMPLE_OBJECT: 'CREATE_SAMPLE_OBJECT',
  UPDATE_SAMPLE_OBJECT: 'UPDATE_SAMPLE_OBJECT',
  DELETE_SAMPLE_OBJECT: 'DELETE_SAMPLE_OBJECT',
  CREATE_KUNSTWERKEN: 'CREATE_KUNSTWERKEN',
  LINK_LOCATION_OBJECT: 'LINK_LOCATION_OBJECT',
  MERGE_SAMPLE_OBJECTS: 'MERGE_SAMPLE_OBJECTS',

  // Planning: dagen en stops
  CREATE_SAMPLE_PLAN: 'CREATE_SAMPLE_PLAN',
  UPDATE_SAMPLE_PLAN: 'UPDATE_SAMPLE_PLAN',
  DELETE_SAMPLE_PLAN: 'DELETE_SAMPLE_PLAN',
  ADD_PLAN_STOP: 'ADD_PLAN_STOP',
  UPDATE_PLAN_STOP: 'UPDATE_PLAN_STOP',
  DELETE_PLAN_STOP: 'DELETE_PLAN_STOP',
  CALCULATE_PLAN_ROUTE: 'CALCULATE_PLAN_ROUTE',

  // Settings
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  VIEW_SETTINGS: 'VIEW_SETTINGS',


  // Klanten, contactpersonen en installaties (verwijderen is zacht)
  CREATE_KLANT: 'CREATE_KLANT',
  UPDATE_KLANT: 'UPDATE_KLANT',
  DELETE_KLANT: 'DELETE_KLANT',
  RESTORE_KLANT: 'RESTORE_KLANT',
  PROSPECT_WORDT_KLANT: 'PROSPECT_WORDT_KLANT',
  CREATE_CONTACTPERSOON: 'CREATE_CONTACTPERSOON',
  UPDATE_CONTACTPERSOON: 'UPDATE_CONTACTPERSOON',
  DELETE_CONTACTPERSOON: 'DELETE_CONTACTPERSOON',
  RESTORE_CONTACTPERSOON: 'RESTORE_CONTACTPERSOON',
  CREATE_INSTALLATIE: 'CREATE_INSTALLATIE',
  UPDATE_INSTALLATIE: 'UPDATE_INSTALLATIE',
  DELETE_INSTALLATIE: 'DELETE_INSTALLATIE',
  RESTORE_INSTALLATIE: 'RESTORE_INSTALLATIE',
  UPLOAD_INSTALLATIE_FOTO: 'UPLOAD_INSTALLATIE_FOTO',
  DELETE_INSTALLATIE_FOTO: 'DELETE_INSTALLATIE_FOTO',
  UPLOAD_KLANT_LOGO: 'UPLOAD_KLANT_LOGO',
  DELETE_KLANT_LOGO: 'DELETE_KLANT_LOGO',

  // Klantportaal: wie haalde welk rapport op
  RAPPORT_DOWNLOAD: 'RAPPORT_DOWNLOAD',

  // Inspecties (verwijderen is zacht)
  CREATE_INSPECTIE: 'CREATE_INSPECTIE',
  UPDATE_INSPECTIE: 'UPDATE_INSPECTIE',
  DELETE_INSPECTIE: 'DELETE_INSPECTIE',
  RESTORE_INSPECTIE: 'RESTORE_INSPECTIE',
  CREATE_INSPECTIE_ITEM: 'CREATE_INSPECTIE_ITEM',
  UPDATE_INSPECTIE_ITEM: 'UPDATE_INSPECTIE_ITEM',
  DELETE_INSPECTIE_ITEM: 'DELETE_INSPECTIE_ITEM',
  RESTORE_INSPECTIE_ITEM: 'RESTORE_INSPECTIE_ITEM',
  UPLOAD_INSPECTIE_FOTO: 'UPLOAD_INSPECTIE_FOTO',
  DELETE_INSPECTIE_FOTO: 'DELETE_INSPECTIE_FOTO',
  INSPECTIE_RAPPORT_DOWNLOAD: 'INSPECTIE_RAPPORT_DOWNLOAD',

  // Eigen dossier (alleen admin, verwijderen is zacht)
  CREATE_EIGEN_DOCUMENT: 'CREATE_EIGEN_DOCUMENT',
  UPDATE_EIGEN_DOCUMENT: 'UPDATE_EIGEN_DOCUMENT',
  DELETE_EIGEN_DOCUMENT: 'DELETE_EIGEN_DOCUMENT',
  RESTORE_EIGEN_DOCUMENT: 'RESTORE_EIGEN_DOCUMENT',
  UPLOAD_EIGEN_DOCUMENT_BESTAND: 'UPLOAD_EIGEN_DOCUMENT_BESTAND',
  DELETE_EIGEN_DOCUMENT_BESTAND: 'DELETE_EIGEN_DOCUMENT_BESTAND',
  INHUURDOSSIER_DOWNLOAD: 'INHUURDOSSIER_DOWNLOAD',


  // Acquisitie
  CREATE_PROSPECT: 'CREATE_PROSPECT',
  UPDATE_PROSPECT: 'UPDATE_PROSPECT',
  DELETE_PROSPECT: 'DELETE_PROSPECT',
  IMPORT_PROSPECTS: 'IMPORT_PROSPECTS',
  EXPORT_PROSPECTS: 'EXPORT_PROSPECTS',
  CREATE_PROSPECT_CONTACT: 'CREATE_PROSPECT_CONTACT',
  UPDATE_PROSPECT_CONTACT: 'UPDATE_PROSPECT_CONTACT',
  DELETE_PROSPECT_CONTACT: 'DELETE_PROSPECT_CONTACT',

  // Contracten met terugkerende taken (fase 5)
  CREATE_CONTRACT: 'CREATE_CONTRACT',
  UPDATE_CONTRACT: 'UPDATE_CONTRACT',
  DELETE_CONTRACT: 'DELETE_CONTRACT',
  RESTORE_CONTRACT: 'RESTORE_CONTRACT',
  CREATE_CONTRACT_TAAK: 'CREATE_CONTRACT_TAAK',
  UPDATE_CONTRACT_TAAK: 'UPDATE_CONTRACT_TAAK',
  DELETE_CONTRACT_TAAK: 'DELETE_CONTRACT_TAAK',
  RESTORE_CONTRACT_TAAK: 'RESTORE_CONTRACT_TAAK',
  CONTRACT_TAAK_UITGEVOERD: 'CONTRACT_TAAK_UITGEVOERD',
  CONTRACT_TAAK_UITVOERING_ONGEDAAN: 'CONTRACT_TAAK_UITVOERING_ONGEDAAN',

  // Dagrapporten (fase 5)
  CREATE_DAGRAPPORT: 'CREATE_DAGRAPPORT',
  UPDATE_DAGRAPPORT: 'UPDATE_DAGRAPPORT',
  DELETE_DAGRAPPORT: 'DELETE_DAGRAPPORT',
  RESTORE_DAGRAPPORT: 'RESTORE_DAGRAPPORT',
  UPLOAD_DAGRAPPORT_FOTO: 'UPLOAD_DAGRAPPORT_FOTO',
  DELETE_DAGRAPPORT_FOTO: 'DELETE_DAGRAPPORT_FOTO',
  DAGRAPPORT_GETEKEND: 'DAGRAPPORT_GETEKEND',
  DAGRAPPORT_HANDTEKENING_GEWIST: 'DAGRAPPORT_HANDTEKENING_GEWIST',
  DAGRAPPORT_AFGEROND: 'DAGRAPPORT_AFGEROND',
  DAGRAPPORT_HEROPEND: 'DAGRAPPORT_HEROPEND',
  DAGRAPPORT_DOWNLOAD: 'DAGRAPPORT_DOWNLOAD',

  // Agendafeed (fase 5)
  AGENDA_FEED_AANGEMAAKT: 'AGENDA_FEED_AANGEMAAKT',
  AGENDA_FEED_INGETROKKEN: 'AGENDA_FEED_INGETROKKEN',
} as const;
