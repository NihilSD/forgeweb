function averageAge(people) {
  return people.reduce((sum, p) => sum + p.age, 0) / people.length;
}
