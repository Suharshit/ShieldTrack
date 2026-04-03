import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase";
import jwt from "jsonwebtoken";

interface ParentLoginRequest {
  institute_code: string;
  registration_no: string;
}

interface ParentSession {
  user_id: string;
  tenant_id: string;
  student_id: string;
  bus_id: string | null;
  role: "parent";
  access_token: string;
  expires_at: string;
}

interface LoginResponse {
  session: ParentSession;
}

const router = Router();
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET || "development-shieldtrack-secret";

router.post("/login", async (req, res) => {
  const payload: ParentLoginRequest = req.body;

  if (!payload.institute_code || !payload.registration_no) {
    return res
      .status(400)
      .json({
        error: {
          message: "Institute code and Registration Number are required",
        },
      });
  }

  try {
    // 1. Verify Institute Code
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("institute_code", payload.institute_code)
      .single();

    if (tenantError || !tenant) {
      return res
        .status(401)
        .json({ error: { message: "Invalid Institute Code" } });
    }

    // 2. Verify Student ID belongs to that Tenant
    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select("id, name, registration_no")
      .eq("registration_no", payload.registration_no)
      .eq("tenant_id", tenant.id)
      .single();

    if (studentError || !student) {
      return res
        .status(401)
        .json({
          error: { message: "Invalid Registration Number for this Institute" },
        });
    }

    // 3. TODO Phase 2: query trip_assignments for student's route to resolve real bus_id
    const resolvedBusId: string | null = null;

    // 4. Generate a JWT representing the Parent session
    const tokenPayload = {
      sub: student.id,
      role: "parent",
      tenant_id: tenant.id,
      student_id: student.id,
    };
    const access_token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: "7d",
    });

    const response: LoginResponse = {
      session: {
        user_id: `parent_${student.id}`,
        tenant_id: tenant.id,
        student_id: student.id,
        bus_id: resolvedBusId,
        role: "parent",
        access_token: access_token,
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      },
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error("Auth route error:", err);
    return res
      .status(500)
      .json({ error: { message: "Internal Server Error" } });
  }
});

export default router;
