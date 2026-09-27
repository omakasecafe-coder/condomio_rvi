export type ResumableApplicationStep = "actitud" | "examen" | "validacion" | "bienvenida";

export function resumableApplication(
  status: string,
  applicationStage: string,
  attitudeScore: number | null,
) {
  if (status !== "APPLICANT") return null;
  if (applicationStage === "CONTRACT") {
    return { step: "bienvenida" as const, passedAttitude: true, passedCommercial: true };
  }
  const passedCommercial = applicationStage === "VALIDATION";
  const passedAttitude = attitudeScore !== null && applicationStage !== "ACTITUDINAL";
  const step: ResumableApplicationStep = passedCommercial ? "validacion" : passedAttitude ? "examen" : "actitud";
  return { step, passedAttitude, passedCommercial };
}
