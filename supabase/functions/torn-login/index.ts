
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(data: unknown, status = 200) {
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
    return reply({ success: false, error: "POST requests only" }, 405);
  }

  try {
    const body = await req.json();
    const apiKey = body?.apiKey;

    if (
      typeof apiKey !== "string" ||
      !/^[a-zA-Z0-9]{16}$/.test(apiKey)
    ) {
      return reply({
        success: false,
        error: "Invalid Torn API key format",
      }, 400);
    }

    const response = await fetch(
      `https://api.torn.com/key/?selections=info&key=${encodeURIComponent(apiKey)}`
    );

    const result = await response.json();

    if (!response.ok || result.error) {
      return reply({
        success: false,
        error: result.error?.error || "Torn API verification failed",
      }, 401);
    }

    const user = result.user;

    if (!user || !user.id) {
      return reply({
        success: false,
        error: "Torn did not return your account information.",
      }, 401);
    }

    const factionId = Number(user.faction_id || 0);

    if (factionId !== 57348) {
      return reply({
        success: false,
        error: `Wrong faction. Torn returned faction ID: ${factionId}`,
        playerId: user.id,
        factionId,
      }, 403);
    }

    return reply({
      success: true,
      playerId: user.id,
      playerName: user.name || "Torn member",
      factionId,
      factionName: "SINISTER SICKS",
    });
  } catch (error) {
    return reply({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Unexpected login error",
    }, 500);
  }
});

