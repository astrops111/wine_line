import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Haversine formula: distance between two GPS coordinates in meters */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Extract client IP from request headers (behind proxy) */
function getClientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || req.headers.get("cf-connecting-ip")
    || null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { user_id, store_id, user_lat, user_lng } = body;

    if (!user_id) return jsonResponse({ success: false, code: "ERROR", message: "缺少 user_id" }, 400);
    if (!store_id) return jsonResponse({ success: false, code: "ERROR", message: "缺少 store_id" }, 400);

    // 1. Fetch store config server-side (not from client)
    const { data: store, error: storeErr } = await supabase
      .from("stores")
      .select("id, name, gps_lat, gps_lng, gps_radius_m, clock_in_method, wifi_allowed_ips")
      .eq("id", store_id)
      .single();

    if (storeErr || !store) {
      return jsonResponse({ success: false, code: "ERROR", message: "門市設定載入失敗" }, 400);
    }

    const method = store.clock_in_method ?? "any";
    const wifiAllowedIps: string[] = store.wifi_allowed_ips ?? [];
    const radiusM = store.gps_radius_m || 200;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // 2. Location validation
    let validatedLat: number | null = typeof user_lat === "number" ? user_lat : null;
    let validatedLng: number | null = typeof user_lng === "number" ? user_lng : null;
    let distanceM: number | null = null;
    let clockInMethod = "manual";

    if (validatedLat != null && validatedLng != null && store.gps_lat && store.gps_lng) {
      distanceM = Math.round(haversineDistance(validatedLat, validatedLng, store.gps_lat, store.gps_lng));
    }

    if (method === "wifi") {
      const clientIp = getClientIp(req);
      if (!clientIp || !wifiAllowedIps.includes(clientIp)) {
        return jsonResponse({
          success: false,
          code: "WIFI_NOT_CONNECTED",
          message: "未連接門市 WiFi 網路",
          detail: { client_ip: clientIp },
        });
      }
      clockInMethod = "wifi";

    } else if (method === "gps_required") {
      if (validatedLat == null || validatedLng == null) {
        return jsonResponse({
          success: false,
          code: "GPS_REQUIRED",
          message: "此門市需要 GPS 定位，請允許定位權限。",
        });
      }
      if (!store.gps_lat || !store.gps_lng) {
        return jsonResponse({
          success: false,
          code: "ERROR",
          message: "門市尚未設定 GPS 座標，請聯繫管理員。",
        });
      }
      if (distanceM! > radiusM) {
        return jsonResponse({
          success: false,
          code: "OUT_OF_RANGE",
          message: `距離門市 ${distanceM}m，超出允許範圍 ${radiusM}m`,
          detail: { distance_m: distanceM, radius_m: radiusM },
        });
      }
      clockInMethod = "gps";

    } else if (method === "gps_or_wifi") {
      const withinGps = distanceM != null && distanceM <= radiusM;

      if (withinGps) {
        clockInMethod = "gps";
      } else {
        // Fall back to WiFi IP
        const clientIp = getClientIp(req);
        if (clientIp && wifiAllowedIps.includes(clientIp)) {
          clockInMethod = "wifi";
        } else {
          return jsonResponse({
            success: false,
            code: "OUT_OF_RANGE",
            message: distanceM != null
              ? `距離門市 ${distanceM}m，且未連接門市 WiFi`
              : "GPS 定位失敗，且未連接門市 WiFi",
            detail: { distance_m: distanceM, client_ip: clientIp },
          });
        }
      }

    } else {
      // 'open' / 'any' — always allow
      clockInMethod = validatedLat != null ? "manual" : "manual";
    }

    // 3. Check for existing open record today → clock-out vs clock-in
    const { data: existing } = await supabase
      .from("time_records")
      .select("id, clock_in")
      .eq("user_id", user_id)
      .gte("clock_in", todayStr)
      .is("clock_out", null)
      .maybeSingle();

    let action: "clock_in" | "clock_out";
    let message: string;

    if (existing) {
      // --- CLOCK OUT ---
      action = "clock_out";
      const { error } = await supabase.from("time_records").update({
        clock_out: now.toISOString(),
        clock_in_lat: validatedLat,
        clock_in_lng: validatedLng,
        clock_in_distance_m: distanceM,
        clock_in_method: clockInMethod,
      }).eq("id", existing.id);
      if (error) throw error;
      message = "打卡退出成功！";

    } else {
      // --- CLOCK IN ---
      action = "clock_in";

      // 4. Compute is_late from scheduled shift
      let isLate = false;
      const { data: todayShift } = await supabase
        .from("shift_assignments")
        .select("id, shift_templates(start_time)")
        .eq("user_id", user_id)
        .eq("date", todayStr)
        .in("status", ["published", "acknowledged"])
        .limit(1)
        .maybeSingle();

      if (todayShift) {
        const startTime = (todayShift as any).shift_templates?.start_time;
        if (startTime) {
          const [sh, sm] = startTime.split(":").map(Number);
          const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, 0);
          const lateMins = Math.round((now.getTime() - scheduled.getTime()) / 60000);
          isLate = lateMins > 5; // 5-minute grace period
        }
      }

      const { error } = await supabase.from("time_records").insert({
        user_id,
        store_id,
        clock_in: now.toISOString(),
        is_late: isLate,
        clock_in_lat: validatedLat,
        clock_in_lng: validatedLng,
        clock_in_distance_m: distanceM,
        clock_in_method: clockInMethod,
      });
      if (error) throw error;

      if (clockInMethod === "wifi") {
        message = "打卡成功！（WiFi 驗證）";
      } else if (clockInMethod === "gps" && distanceM != null) {
        message = `打卡成功！距門市 ${distanceM}m`;
      } else {
        message = "打卡成功！";
      }
      if (isLate) message += "（遲到）";
    }

    return jsonResponse({
      success: true,
      action,
      message,
      detail: {
        clock_in_method: clockInMethod,
        distance_m: distanceM,
        lat: validatedLat,
        lng: validatedLng,
      },
    });

  } catch (err: any) {
    console.error("clock-in error:", err);
    return jsonResponse({
      success: false,
      code: "ERROR",
      message: `打卡失敗：${err.message}`,
    }, 400);
  }
});
