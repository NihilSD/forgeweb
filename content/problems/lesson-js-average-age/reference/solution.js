function averageAge(people) {
  if (people.length === 0) return 0;
  return people.reduce((sum, p) => sum + p.age, 0) / people.length;
}
