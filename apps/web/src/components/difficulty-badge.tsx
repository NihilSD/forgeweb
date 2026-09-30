import type { Difficulty } from '@forge/shared';
import { Badge } from '@forge/ui';

const VARIANT: Record<Difficulty, 'success' | 'warning' | 'danger' | 'error'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
  expert: 'error',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <Badge variant={VARIANT[difficulty]} className="capitalize">
      {difficulty}
    </Badge>
  );
}
