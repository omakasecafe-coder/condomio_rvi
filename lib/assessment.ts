const attitudeKey = [1, 2, 0, 1] as const;
const commercialKey = [0, 1, 0, 1] as const;

export function gradeAssessment(kind: "attitude" | "commercial", answers: number[]): number {
  const key = kind === "attitude" ? attitudeKey : commercialKey;
  if (answers.length !== key.length || answers.some(answer => !Number.isInteger(answer) || answer < 0 || answer > 2)) {
    throw new Error("Respuestas incompletas o inválidas.");
  }
  return key.reduce<number>((score, correct, index) => score + Number(answers[index] === correct), 0);
}
