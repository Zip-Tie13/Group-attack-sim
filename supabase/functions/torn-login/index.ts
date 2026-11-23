
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(data: unknown, status = 200) {
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
    return reply({ success: false, error: "POST requests only" }, 405);
  }

  try {
    const body = await req.json();
    const apiKey = body?.apiKey;

    if (typeof apiKey !== "string" || !/^[a-f0-9]{16}$/i.test(apiKey)) {
      return reply({ success: false, error: "Invalid Torn API key format" }, 400);
    }

    const tornResponse = await fetch(
      `https://api.torn.com/user/?selections=basic,faction&key=${encodeURIComponent(apiKey)}`
    );

    const player = await tornResponse.json();

    if (!tornResponse.ok || player.error) {
      return reply({
        success: false,
        error: player.error?.error || "Torn API login failed",
      }, 401);
    }

    const factionId = Number(
      player.faction?.faction_id ?? player.faction?.id ?? 0
    );

    if (factionId !== 57348) {
      return reply({
        success: false,
        error: "Your Torn account is not a member of SINISTER SICKS.",
      }, 403);
    }

    return reply({
      success: true,
      playerId: player.player_id,
      playerName: player.name,
      factionId,
    });
  } catch (error) {
    return reply({
      success: false,
      error: error instanceof Error ? error.message : "Login failed",
    }, 500);
  }
});
