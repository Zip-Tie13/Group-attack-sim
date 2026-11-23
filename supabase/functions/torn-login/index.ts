const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return respond({ success: false, error: "POST requests only." }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const apiKey = body?.apiKey;

    if (typeof apiKey !== "string" || !/^[a-zA-Z0-9]{16}$/.test(apiKey)) {
      return respond({ success: false, error: "Enter a valid 16-character Torn API key." }, 400);
    }

    const key = encodeURIComponent(apiKey);

    // Key info confirms the key and supplies the owner's ID and faction details.
    const infoResponse = await fetch(`https://api.torn.com/v2/key/info?key=${key}`);
    const info = await infoResponse.json();

    if (!infoResponse.ok || info.error) {
      return respond({
        success: false,
        error: info.error?.error || info.error?.message || "Torn could not verify this API key.",
        tornErrorCode: info.error?.code ?? null,
      }, 401);
    }

    // Also request the owner's basic profile. The v1 response uses player_id;
    // this is a reliable fallback if the key-info response shape differs.
    const basicResponse = await fetch(`https://api.torn.com/user/?selections=basic&key=${key}`);
    const basic = await basicResponse.json();

    if (!basicResponse.ok || basic.error) {
      return respond({
        success: false,
        error: basic.error?.error || basic.error?.message || "Torn accepted the key, but could not load the basic player profile.",
        tornErrorCode: basic.error?.code ?? null,
      }, 502);
    }

    const userInfo = info.user ?? info.data?.user ?? info.data ?? {};
    const playerId = Number(
      userInfo.id ??
      userInfo.user_id ??
      userInfo.player_id ??
      info.user_id ??
      info.player_id ??
      basic.player_id ??
      basic.user_id ??
      basic.ID ??
      basic.id ??
      0
    );

    const factionId = Number(
      userInfo.faction_id ??
      info.faction_id ??
      basic.faction?.faction_id ??
      basic.faction_id ??
      0
    );

    const playerName =
      (typeof basic.name === "string" && basic.name) ||
      (typeof userInfo.name === "string" && userInfo.name) ||
      "SINISTER SICKS Member";

    if (!Number.isFinite(playerId) || playerId <= 0) {
      return respond({
        success: false,
        error: "Torn accepted the key, but its basic profile response did not contain a player ID. Please tell the simulator administrator this exact message.",
      }, 502);
    }

    if (!factionId) {
      return respond({
        success: false,
        error: "Torn returned your player ID but no faction ID. The key may not expose faction membership through this response.",
        playerId,
      }, 403);
    }

    if (factionId !== 57348) {
      return respond({
        success: false,
        error: `This account is in faction ID ${factionId}, not SINISTER SICKS (57348).`,
        playerId,
        factionId,
      }, 403);
    }

    return respond({
      success: true,
      playerId,
      playerName,
      factionId: 57348,
      factionName: "SINISTER SICKS",
    });
  } catch (_error) {
    return respond({ success: false, error: "The login service could not reach Torn. Please try again." }, 500);
  }
});
