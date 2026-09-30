function firstAtLeast(builds, queries) {
  return queries.map((q) => {
    let i = 0;
    while (i < builds.length && builds[i] < q) i++;
    return i;
  });
}
