function averageAge(people: { name: string; age: number }[]): number {
  if (people.length === 0) return 0;
  return people.reduce((sum, p) => sum + p.age, 0) / people.length;
}
