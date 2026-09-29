'use client';

// De tabel met monsters. Op de telefoon wordt elke rij een kaart
// (.table-kaarten in globals.css).

import { Icon } from '@/app/components/ui';
import { objectTypeIcoon, objectTypeLabel } from '@/lib/sampleObjects';
import { FOTO_SOORTEN, type FotoSoort } from '@/lib/samplePhotos';
import { sampleStatus, STATUS_BADGE, STATUS_ICOON, STATUS_LABELS } from '@/lib/sampleStatus';
import type { OilSample } from './types';

interface Props {
  samples: OilSample[];
  jaar: number;
  visibleColumns: string[];
  objectenBeschikbaar: boolean;
  isAdmin: boolean;
  /** Er staat een foutmelding boven de lijst: dan geen lege-staattekst */
  foutmelding: boolean;
  filterActief: boolean;
  statusBezig: number | null;
  uploadingPhoto: string | null;
  onToggleStatus: (s: OilSample) => void;
  onOpenFoto: (s: OilSample, url: string) => void;
  onUpload: (sampleId: number, file: File, soort: FotoSoort) => void;
  onNemen: (s: OilSample) => void;
  onMeer: (s: OilSample) => void;
  onBewerk: (s: OilSample) => void;
  onWisFilter: () => void;
  onNieuw: () => void;
  /**
   * Compacte kaarten op de telefoon (beheerder en gebruiker): drie regels per
   * monster en één knop. De kijker krijgt de oude kaarten, dus false.
   */
  compact?: boolean;
  /** Knop Overnemen uit vorig jaar in de lege staat (admin, leeg jaar) */
  overnemen: { vanJaar: number; bezig: boolean; onOvernemen: () => void } | null;
}

// Statusbadge: altijd icoon plus woord (zie STIJL.md). Vier statussen, uit
// lib/sampleStatus.ts, zodat de lijst, de tellingen en de PDF hetzelfde zeggen.
function StatusBadge({ sample }: { sample: OilSample }) {
  const status = sampleStatus(sample);
  const uitleg =
    status === 'geannuleerd'
      ? sample.cancelReason || 'Monster geannuleerd'
      : status === 'niet-bereikbaar'
      ? sample.unreachableReason || 'De locatie was niet te bereiken'
      : undefined;
  return (
    <span className={`badge ${STATUS_BADGE[status]}`} title={uitleg}>
      <Icon name={STATUS_ICOON[status]} size={16} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function MonsterTabel(p: Props) {
  const { samples, visibleColumns, objectenBeschikbaar, isAdmin } = p;
  // Kolommen: de zichtbare kolommen plus Foto, plus Acties voor een admin.
  const kolomAantal = visibleColumns.length + 1 + (objectenBeschikbaar ? 1 : 0) + (isAdmin ? 1 : 0);

  return (
    <div className="table-container">
      <div className="table-scroll">
        <table className={`table table-kaarten${p.compact ? ' table-compact' : ''}`}>
          <thead>
            <tr>
              {visibleColumns.includes('status') && (<th>Status</th>)}
              {visibleColumns.includes('oNumber') && (<th>O-nummer</th>)}
              {visibleColumns.includes('sampleDate') && (<th>Datum</th>)}
              {objectenBeschikbaar && (<th>Object</th>)}
              {visibleColumns.includes('location') && (<th>Locatie</th>)}
              {visibleColumns.includes('description') && (<th>Omschrijving</th>)}
              {visibleColumns.includes('oilType') && (<th>Type olie</th>)}
              {visibleColumns.includes('remarks') && (<th>Opmerkingen</th>)}
              <th>Foto</th>
              {isAdmin && (<th>Acties</th>)}
            </tr>
          </thead>
          <tbody>
            {samples.length === 0 ? (
              // Geen rijen: fout, filter zonder treffers of echt nog niets. Bij een
              // fout staat de melding al boven de lijst, dan hier geen tekst.
              p.foutmelding ? null : (
                <tr>
                  <td colSpan={kolomAantal} className="td-leeg">
                    <div className="leeg leeg-in-tabel">
                      <Icon name="empty" size={32} />
                      {p.filterActief ? (
                        <>
                          <p style={{ margin: '0 0 12px' }}>Geen monsters die aan dit filter voldoen.</p>
                          <button type="button" className="btn btn-sm" onClick={p.onWisFilter}>
                            <Icon name="clear-selection" size={16} />
                            Filter wissen
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: '0 0 12px' }}>Nog geen monsters voor {p.jaar}.</p>
                          {isAdmin && (
                            <div className="knoppenrij" style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button type="button" className="btn btn-primary btn-sm" onClick={p.onNieuw}>
                                <Icon name="plus" size={16} />
                                Nieuw monster
                              </button>
                              {p.overnemen && (
                                <button type="button" className="btn btn-sm" onClick={p.overnemen.onOvernemen} disabled={p.overnemen.bezig}>
                                  <Icon name="copy-year" size={16} />
                                  {p.overnemen.bezig ? 'Bezig...' : `Overnemen uit ${p.overnemen.vanJaar}`}
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            ) : (
              samples.map((sample) => (
                <tr key={sample.id} style={{ opacity: sample.isDisabled ? 0.6 : 1 }}>
                  {visibleColumns.includes('status') && (
                    <td data-label="Status" className="kaart-status" style={{ whiteSpace: 'nowrap' }}>
                      {/* Compact op de telefoon: alleen de badge. De snelle statustik
                          blijft voor het bijwerken achteraf op desktop. */}
                      {p.compact && (
                        <span className="compact-badge">
                          <StatusBadge sample={sample} />
                        </span>
                      )}
                      <span className="status-cel">
                        {/* Hoofdhandeling: één tik zet het monster op genomen of niet genomen */}
                        {isAdmin && !sample.isDisabled ? (
                          <button
                            type="button"
                            className={`status-knop${p.statusBezig === sample.id ? ' status-knop-bezig' : ''}`}
                            onClick={() => p.onToggleStatus(sample)}
                            disabled={p.statusBezig === sample.id}
                            aria-pressed={sample.isTaken}
                            title={
                              sample.isTaken
                                ? `${sample.oNumber} op niet genomen zetten`
                                : `${sample.oNumber} op genomen zetten, met de datum van vandaag`
                            }
                          >
                            <StatusBadge sample={sample} />
                          </button>
                        ) : (
                          <StatusBadge sample={sample} />
                        )}
                        {sample.isDisabled && sample.cancelReason && (
                          <span className="annuleer-reden">{sample.cancelReason}</span>
                        )}
                        {!sample.isDisabled && !sample.isTaken && sample.isUnreachable && (
                          <>
                            {sample.unreachableReason && (
                              <span className="onbereikbaar-reden">{sample.unreachableReason}</span>
                            )}
                            {sample.unreachableNote && (
                              <span className="onbereikbaar-omschrijving">{sample.unreachableNote}</span>
                            )}
                          </>
                        )}
                        {(sample.attemptsCount ?? 0) > 1 && (
                          <span
                            className="badge badge-navy"
                            title={`${sample.attemptsCount} monsternames (incl. hermonstering)`}
                          >
                            <Icon name="resample" size={16} />
                            {sample.attemptsCount}x
                          </span>
                        )}
                      </span>
                    </td>
                  )}
                  {visibleColumns.includes('oNumber') && (
                    <td data-label="O-nummer" className="kaart-kop font-medium" style={{
                      whiteSpace: 'nowrap',
                      textDecoration: sample.isDisabled ? 'line-through' : 'none',
                      opacity: sample.isDisabled ? 0.7 : 1
                    }}>
                      {sample.oNumber}
                    </td>
                  )}
                  {p.compact && (
                    <td className="compact-samenvatting">
                      {/* Alleen op de telefoon: plek en omschrijving, dan object en datum.
                          Een tik opent het monster (beheerder) of de foto's. */}
                      <button
                        type="button"
                        className="compact-open"
                        onClick={() => {
                          if (isAdmin) p.onBewerk(sample);
                          else if (sample.partPhotoUrl || sample.photoUrl) p.onOpenFoto(sample, (sample.partPhotoUrl || sample.photoUrl)!);
                        }}
                        disabled={!isAdmin && !sample.partPhotoUrl && !sample.photoUrl}
                        aria-label={isAdmin ? `${sample.oNumber} openen` : `Foto's van ${sample.oNumber}`}
                      >
                        <span className="compact-regel">
                          {[sample.location, sample.description].filter(Boolean).join(' · ')}
                        </span>
                        <span className="compact-regel compact-regel-sub">
                          {[
                            sample.object?.name,
                            sample.isTaken && sample.sampleDate ? new Date(sample.sampleDate).toLocaleDateString('nl-NL') : null,
                            sample.oilType,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Geen object of datum'}
                          {(sample.partPhotoUrl || sample.photoUrl) && (
                            <span className="compact-foto" title="Heeft foto's">
                              <Icon name="camera" size={16} />
                            </span>
                          )}
                        </span>
                        {sample.isUnreachable && !sample.isTaken && !sample.isDisabled && sample.unreachableReason && (
                          <span className="compact-regel compact-regel-sub">Niet bereikbaar: {sample.unreachableReason}</span>
                        )}
                        {sample.isDisabled && sample.cancelReason && (
                          <span className="compact-regel compact-regel-sub">Geannuleerd: {sample.cancelReason}</span>
                        )}
                      </button>
                    </td>
                  )}
                  {visibleColumns.includes('sampleDate') && (
                    <td data-label="Datum" style={{ whiteSpace: 'nowrap' }}>
                      {sample.isTaken && sample.sampleDate ? new Date(sample.sampleDate).toLocaleDateString('nl-NL') : '-'}
                    </td>
                  )}
                  {objectenBeschikbaar && (
                    <td data-label="Object">
                      {sample.object ? (
                        <span className="badge badge-gray" title={objectTypeLabel(sample.object.objectType)}>
                          <Icon name={objectTypeIcoon(sample.object.objectType)} size={16} />
                          {sample.object.name}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  )}
                  {visibleColumns.includes('location') && (
                    <td data-label="Locatie" style={{ opacity: sample.isDisabled ? 0.7 : 1 }}>
                      {sample.location}
                    </td>
                  )}
                  {visibleColumns.includes('description') && (
                    <td data-label="Omschrijving">
                      {sample.description}
                    </td>
                  )}
                  {visibleColumns.includes('oilType') && (
                    <td data-label="Type olie">
                      {sample.oilType || '-'}
                    </td>
                  )}
                  {visibleColumns.includes('remarks') && (
                    <td data-label="Opmerkingen">
                      {sample.remarks || '-'}
                    </td>
                  )}
                  <td data-label="Foto">
                    {/* Twee foto's per monster: het onderdeel en het potje. Plus,
                        als het er is, het bewijs dat de locatie niet te bereiken was. */}
                    <span className="foto-cel">
                      {FOTO_SOORTEN.map((soort) => {
                        const url = soort.veld === 'photoUrl' ? sample.photoUrl : sample.partPhotoUrl;
                        const bezig = p.uploadingPhoto === `${sample.id}-${soort.soort}`;
                        if (url) {
                          return (
                            <button
                              key={soort.soort}
                              type="button"
                              onClick={() => p.onOpenFoto(sample, url)}
                              className="btn-link"
                              title={`${soort.label} van ${sample.oNumber} bekijken`}
                            >
                              <Icon name={soort.icoon} size={16} />
                              <span className="alleen-desktop">{soort.kort}</span>
                              <span className="alleen-mobiel">{soort.label}</span>
                            </button>
                          );
                        }
                        if (!isAdmin) {
                          return (
                            <span key={soort.soort} className="text-tertiary" style={{ fontSize: '13px' }} title={`Geen ${soort.label.toLowerCase()}`}>
                              <span className="alleen-desktop">Geen {soort.kort.toLowerCase()}</span>
                              <span className="alleen-mobiel">Geen {soort.label.toLowerCase()}</span>
                            </span>
                          );
                        }
                        return (
                          <label key={soort.soort} className="btn-link" style={{ color: 'var(--grijs-500)' }} title={soort.knop}>
                            {bezig ? 'Uploaden...' : (
                              <>
                                <Icon name="image-upload" size={16} />
                                <span className="alleen-desktop">{soort.kort}</span>
                                <span className="alleen-mobiel">{soort.knop}</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              disabled={bezig}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) p.onUpload(sample.id, file, soort.soort);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        );
                      })}
                      {sample.unreachablePhotoUrl && (
                        <button
                          type="button"
                          onClick={() => p.onOpenFoto(sample, sample.unreachablePhotoUrl!)}
                          className="btn-link"
                          title={`Foto van de situatie bij ${sample.oNumber}`}
                        >
                          <Icon name="alert-warning" size={16} />
                          <span className="alleen-desktop">Situatie</span>
                          <span className="alleen-mobiel">Foto niet bereikbaar</span>
                        </button>
                      )}
                    </span>
                  </td>
                  {isAdmin && (
                    <td data-label="Acties" className="kaart-acties acties-cel">
                      {/* Monster nemen: het volledige invulscherm in één keer.
                          Alleen zolang het monster nog open staat. De rest
                          (annuleren, hermonstering, niet bereikbaar) zit achter
                          Meer, zodat de rij binnen de tabel blijft. */}
                      {!sample.isDisabled && !sample.isTaken && (
                        <button
                          type="button"
                          onClick={() => p.onNemen(sample)}
                          className="btn btn-sm sm:mr-2.5 knop-nemen"
                          title={`${sample.oNumber} nemen: datum, type olie, opmerking en beide foto's in één keer`}
                        >
                          <Icon name="oil-sample" size={16} />
                          <span className="lang">Monster nemen</span>
                          <span className="kort">Nemen</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => p.onMeer(sample)}
                        className="btn btn-sm sm:mr-2.5 knop-meer"
                        aria-label={`Meer bij ${sample.oNumber}`}
                        aria-haspopup="dialog"
                        title={`Meer handelingen bij ${sample.oNumber}: annuleren, hermonstering${sample.isUnreachable ? ', niet bereikbaar' : ''}`}
                      >
                        <Icon name="menu" size={16} />
                        <span className="knop-meer-tekst">Meer</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => p.onBewerk(sample)}
                        className="icon-btn sm:mr-1 knop-bewerk"
                        title="Bewerken"
                        aria-label={`${sample.oNumber} bewerken`}
                      >
                        <Icon name="pencil" size={16} />
                        <span className="alleen-mobiel">Bewerken</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
