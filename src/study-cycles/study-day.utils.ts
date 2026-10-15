export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getLocalDayOrdinal(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
    (24 * 60 * 60 * 1000)
  );
}

export function calculateStudyStreaks(
  completedAtDates: readonly (Date | null)[],
  now = new Date(),
): { currentStreak: number; longestStreak: number } {
  const studyDays = [
    ...new Set(
      completedAtDates
        .filter((date): date is Date => date !== null)
        .map(getLocalDayOrdinal),
    ),
  ].sort((a, b) => a - b);

  let longestStreak = 0;
  let streak = 0;

  for (let i = 0; i < studyDays.length; i++) {
    if (i > 0 && studyDays[i] === studyDays[i - 1] + 1) {
      streak++;
    } else {
      streak = 1;
    }

    longestStreak = Math.max(longestStreak, streak);
  }

  let currentStreak = 0;
  if (studyDays.length > 0) {
    const today = getLocalDayOrdinal(now);
    const lastStudyDay = studyDays[studyDays.length - 1];

    if (lastStudyDay === today || lastStudyDay === today - 1) {
      currentStreak = 1;

      for (let i = studyDays.length - 1; i > 0; i--) {
        if (studyDays[i] !== studyDays[i - 1] + 1) {
          break;
        }

        currentStreak++;
      }
    }
  }

  return { currentStreak, longestStreak };
}
