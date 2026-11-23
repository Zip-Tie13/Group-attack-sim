
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ success: false, error: "POST requests only" }, 405);
  }

  try {
    const body = await req.json();
    const apiKey = body?.apiKey;

    if (
      typeof apiKey !== "string" ||
      !/^[a-zA-Z0-9]{16}$/.test(apiKey)
    ) {
      return respond({
        success: false,
        error: "Invalid Torn API key format.",
      }, 400);
    }

    const encodedKey = encodeURIComponent(apiKey);

    // Get the player's basic information.
    const basicResponse = await fetch(
      `https://api.torn.com/user/?selections=basic&key=${encodedKey}`
    );

    const basicData = await basicResponse.json();

    if (!basicResponse.ok || basicData.error) {
      return respond({
        success: false,
        error: basicData.error?.error || "Torn basic profile lookup failed.",
      }, 401);
    }

    // Get faction membership from Torn's dedicated API v2 endpoint.
    const factionResponse = await fetch(
      `https://api.torn.com/v2/user/faction?key=${encodedKey}`
    );

    const factionData = await factionResponse.json();

    if (!factionResponse.ok || factionData.error) {
      return respond({
        success: false,
        error:
          factionData.error?.error ||
          "Torn faction lookup failed. Check the API response.",
      }, 401);
    }

    // Support the faction object and its common response wrappers.
    const faction =
      factionData.faction ||
      factionData.data?.faction ||
      factionData.data ||
      factionData;

    const returnedFactionId = Number(
      faction.id ??
      faction.ID ??
      faction.faction_id ??
      faction.faction?.id ??
      0
    );

    const playerId = basicData.player_id ?? basicData.player?.id;
    const playerName = basicData.name ?? basicData.player?.name;

    if (!playerId) {
      return respond({
        success: false,
        error: "Torn did not return your player ID.",
      }, 401);
    }

    if (!returnedFactionId) {
      return respond({
        success: false,
        error: "Torn returned no faction ID.",
        diagnostic: {
          factionResponse: factionData,
        },
      }, 403);
    }

    if (returnedFactionId !== 57348) {
      return respond({
        success: false,
        error: `Faction ID mismatch. Torn returned ${returnedFactionId}; expected 57348.`,
        playerId,
        factionId: returnedFactionId,
      }, 403);
    }

    return respond({
      success: true,
      playerId,
      playerName: playerName || "SINISTER SICKS Member",
      factionId: 57348,
      factionName: "SINISTER SICKS",
    });

  } catch (error) {
    return respond({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Unexpected login error.",
    }, 500);
  }
});
