import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeDocument, publicAuthClient, serviceClient } from "@/lib/auth-config";
import { requestSession } from "@/lib/request-session";

export const dynamic = "force-dynamic";

const profileFields = z.object({
  firstName: z.string().trim().min(1).max(100),
  paternalSurname: z.string().trim().min(1).max(100),
  maternalSurname: z.string().trim().min(1).max(100),
  documentType: z.enum(["DNI", "CE", "PASAPORTE"]),
  documentNumber: z.string().trim(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phone: z.string().trim().min(6).max(30),
  email: z.string().email().max(254),
});

const answersFields = z.object({
  action: z.enum(["attitude", "aptitude"]),
  setId: z.string().uuid(),
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    optionIndex: z.number().int().min(0).max(5),
  })).min(1).max(50),
});

export async function GET() {
  const termsUrl = process.env.TERMS_URL?.trim() || "";
  const termsVersion = process.env.TERMS_VERSION?.trim() || "";
  const materialUrl = process.env.MATERIALS_URL?.trim() || "";
  const { data: assessments, error } = await publicAuthClient().rpc("get_published_assessments");
  return NextResponse.json({
    termsUrl: /^https:\/\//.test(termsUrl) ? termsUrl : null,
    termsVersion: /^https:\/\//.test(termsUrl) ? termsVersion || null : null,
    materialsUrl: /^https:\/\//.test(materialUrl) ? materialUrl : null,
    acceptingApplications: process.env.APPLICATIONS_ENABLED === "true" && /^https:\/\//.test(termsUrl) && !!termsVersion,
    assessments: error ? [] : assessments,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (process.env.APPLICATIONS_ENABLED !== "true") {
    return NextResponse.json({ error: "Las postulaciones todavía no están habilitadas." }, { status: 503 });
  }
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }
  try {
    const context = requestSession(request);
    const { data: auth, error: authError } = await context.client.auth.getUser();
    if (authError || !auth.user?.email || !auth.user.email_confirmed_at) {
      return context.respond({ error: "Verifica primero tu correo electrónico." }, 401);
    }
    const user = auth.user;
    const userEmail = user.email;
    if (!userEmail) return context.respond({ error: "Verifica primero tu correo electrónico." }, 401);
    const db = serviceClient();
    const { data: profile, error: profileError } = await context.client.from("seller_profiles")
      .select("id,status,attitude_score,aptitude_score,knowledge_score,identity_document_path")
      .eq("auth_user_id", user.id).maybeSingle();
    if (profileError) throw profileError;

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (!profile || profile.status !== "APPLICANT" || (profile.attitude_score ?? 0) < 3 || (profile.knowledge_score ?? 0) < 3) {
        return context.respond({ error: "Completa primero las evaluaciones." }, 403);
      }
      const termsUrl = process.env.TERMS_URL?.trim() || "";
      const termsVersion = process.env.TERMS_VERSION?.trim() || "";
      if (!/^https:\/\//.test(termsUrl) || !termsVersion) {
        return context.respond({ error: "Las condiciones oficiales todavía no están disponibles." }, 503);
      }
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 6_000_000) return context.respond({ error: "El archivo supera el límite de 5 MB." }, 413);
      const form = await request.formData();
      const photo = form.get("photo");
      const bankAccount = String(form.get("bankAccount") || "").replace(/\s/g, "");
      const cci = String(form.get("cci") || "").replace(/\s/g, "");
      if (!(photo instanceof File) || photo.size < 1 || photo.size > 5_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
        return context.respond({ error: "Adjunta una foto JPG, PNG o WebP de hasta 5 MB." }, 400);
      }
      if (!/^\d{6,30}$/.test(bankAccount) || !/^\d{20}$/.test(cci) || form.get("termsVersion") !== termsVersion || form.get("accepted") !== "true") {
        return context.respond({ error: "Revisa la cuenta, el CCI y la aceptación de condiciones." }, 400);
      }
      const extension = photo.type === "image/jpeg" ? "jpg" : photo.type === "image/png" ? "png" : "webp";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await db.storage.from("seller-identity").upload(path, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: updateError } = await db.from("seller_profiles").update({
        identity_document_path: path,
        bank_account: bankAccount,
        cci,
        terms_accepted_at: new Date().toISOString(),
        terms_version: termsVersion,
        status: "ACTIVE",
        updated_at: new Date().toISOString(),
      }).eq("id", profile.id).eq("status", "APPLICANT").select("id").single();
      if (updateError) {
        await db.storage.from("seller-identity").remove([path]);
        throw updateError;
      }
      return context.respond({ ok: true });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return context.respond({ error: "Solicitud inválida." }, 400);
    if (body.action === "profile") {
      if (profile) return context.respond({ error: "Ya existe una postulación para esta cuenta." }, 409);
      const parsed = profileFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Revisa tus datos personales." }, 400);
      const data = parsed.data;
      const document = normalizeDocument(data.documentType, data.documentNumber);
      if (!document || data.email.trim().toLowerCase() !== userEmail.toLowerCase()) {
        return context.respond({ error: "El documento o el correo no coinciden con la verificación." }, 400);
      }
      const { error } = await context.client.from("seller_profiles").insert({
        auth_user_id: user.id,
        document_type: document.documentType,
        document_number: document.documentNumber,
        email: userEmail.toLowerCase(),
        first_name: data.firstName,
        paternal_surname: data.paternalSurname,
        maternal_surname: data.maternalSurname,
        birth_date: data.birthDate,
        phone: data.phone,
        status: "APPLICANT",
        application_stage: "ACTITUDINAL",
      });
      if (error) {
        if (error.code === "23505") return context.respond({ error: "Este documento ya tiene una postulación. Contacta a administración." }, 409);
        throw error;
      }
      return context.respond({ ok: true }, 201);
    }

    const parsed = answersFields.safeParse(body);
    if (!parsed.success || !profile || profile.status !== "APPLICANT") {
      return context.respond({ error: "No puedes realizar esta evaluación." }, 403);
    }
    const { action, answers } = parsed.data;
    if (action === "aptitude" && profile.attitude_score === null) {
      return context.respond({ error: "Primero debes aprobar la evaluación actitudinal." }, 403);
    }
    const { data: result, error } = await context.client.rpc("submit_assessment_attempt", {
      p_set_id: parsed.data.setId,
      p_answers: answers.map(answer => ({ question_id: answer.questionId, option_index: answer.optionIndex })),
    });
    if (error) throw error;
    return context.respond({ ok: true, ...(result as Record<string, unknown>) });
  } catch (error) {
    console.error("Applicant update failed", error);
    return NextResponse.json({ error: "No se pudo guardar la postulación." }, { status: 503 });
  }
}

