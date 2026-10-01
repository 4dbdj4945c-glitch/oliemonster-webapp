// De status van een werkbon als badge: concept, afgerond of getekend.

import { Icon } from '@/app/components/ui';
import { STATUS_LABEL, type WerkbonStatus } from '@/lib/werkbon';

export default function WerkbonStatusBadge({ status }: { status: WerkbonStatus }) {
  if (status === 'getekend') return <span className="badge badge-success"><Icon name="signature" size={16} />{STATUS_LABEL.getekend}</span>;
  if (status === 'afgerond') return <span className="badge badge-success"><Icon name="check" size={16} />{STATUS_LABEL.afgerond}</span>;
  return <span className="badge badge-gray">{STATUS_LABEL.concept}</span>;
}
