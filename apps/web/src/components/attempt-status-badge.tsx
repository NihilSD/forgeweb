import type { AttemptStatus } from '@forge/shared';
import { Badge, cn } from '@forge/ui';
import { BadgeCheck } from 'lucide-react';

const LABEL: Record<AttemptStatus, string> = {
  in_progress: 'In progress',
  followups: 'Follow-up questions',
  verified: 'Verified',
  unverified: 'Unverified',
  review: 'Under review',
  appealed: 'Appeal pending',
  expired: 'Time ran out',
};

const VARIANT: Record<AttemptStatus, 'success' | 'warning' | 'outline' | 'secondary'> = {
  in_progress: 'outline',
  followups: 'outline',
  verified: 'success',
  unverified: 'warning',
  review: 'secondary',
  appealed: 'secondary',
  expired: 'outline',
};

export function AttemptStatusBadge({
  status,
  className,
}: {
  status: AttemptStatus;
  className?: string;
}) {
  return (
    <Badge variant={VARIANT[status]} className={cn('gap-1', className)} data-status={status}>
      {status === 'verified' ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> : null}
      {LABEL[status]}
    </Badge>
  );
}
