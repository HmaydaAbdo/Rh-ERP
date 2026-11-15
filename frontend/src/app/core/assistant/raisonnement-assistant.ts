/** Durée de réflexion en français : « moins d'une seconde », « 4 s », « 1 min 5 s ». */
export function dureeReflexion(secondes: number): string {
  const entieres = Math.round(secondes);
  if (!Number.isFinite(secondes) || entieres < 1) {
    return 'moins d’une seconde';
  }
  if (entieres < 60) {
    return `${entieres} s`;
  }
  const minutes = Math.floor(entieres / 60);
  const reste = entieres % 60;
  return reste === 0 ? `${minutes} min` : `${minutes} min ${reste} s`;
}
