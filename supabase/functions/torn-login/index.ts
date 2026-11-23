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

    // Torn API keys are 16 characters. Never return or log the submitted key.
    if (typeof apiKey !== "string" || !/^[a-zA-Z0-9]{16}$/.test(apiKey)) {
      return respond({ success: false, error: "Enter a valid 16-character Torn API key." }, 400);
    }

    const key = encodeURIComponent(apiKey);

    // Torn documents /v2/key/info as the endpoint that exposes the key owner's
    // user.faction_id, even when the key does not have faction AA permissions.
    const infoResponse = await fetch(`https://api.torn.com/v2/key/info?key=${key}`);
    const info = await infoResponse.json();

    if (!infoResponse.ok || info.error) {
      return respond({
        success: false,
        error: info.error?.error || info.error?.message || "Torn could not verify this API key.",
        tornErrorCode: info.error?.code ?? null,
      }, 401);
    }

    const userInfo = info.user ?? info.data?.user ?? {};
    const factionId = Number(userInfo.faction_id ?? info.access?.faction_id ?? 0);
    const playerId = userInfo.id ?? userInfo.player_id ?? info.player_id ?? null;

    if (!playerId) {
      return respond({ success: false, error: "Torn accepted the key but did not return the player ID." }, 502);
    }

    if (!factionId) {
      return respond({
        success: false,
        error: "Torn reports that this account is not currently in a faction.",
        playerId,
        factionId: 0,
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

    // Get the player's display name separately; this is a basic user lookup.
    let playerName = "SINISTER SICKS Member";
    const basicResponse = await fetch(`https://api.torn.com/user/?selections=basic&key=${key}`);
    const basic = await basicResponse.json();
    if (basicResponse.ok && !basic.error && typeof basic.name === "string") {
      playerName = basic.name;
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
