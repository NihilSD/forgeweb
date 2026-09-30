import type { GenContext, Instance, Rng } from '@forge/problem-kit';

/** O(n) reference used as the test oracle. */
export function longest(minutes: number[], budget: number): number {
  let best = 0;
  let sum = 0;
  let left = 0;
  for (let right = 0; right < minutes.length; right++) {
    sum += minutes[right]!;
    while (sum > budget) sum -= minutes[left++]!;
    best = Math.max(best, right - left + 1);
  }
  return best;
}

export function randomDays(rng: Rng, n: number, max: number): number[] {
  return Array.from({ length: n }, () => rng.int(0, max));
}

export default function generate({ rng }: GenContext): Instance {
  const example = randomDays(rng, 8, 60);
  const exampleBudget = rng.int(60, 150);
  return {
    params: {
      person: rng.word('person'),
      activity: rng.pick(['reading', 'practising guitar', 'running', 'studying SQL', 'gaming']),
      budget: rng.int(90, 400),
      example_minutes: JSON.stringify(example),
      example_budget: exampleBudget,
      example_result: longest(example, exampleBudget),
    },
    data: { example, exampleBudget },
  };
}
