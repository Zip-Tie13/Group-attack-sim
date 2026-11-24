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

function positiveId(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ success: false, error: "POST requests only." }, 405);

  try {
    const body = await req.json().catch(() => null);
    const apiKey = body?.apiKey;
    if (typeof apiKey !== "string" || !/^[a-zA-Z0-9]{16}$/.test(apiKey)) {
      return respond({ success: false, error: "Enter a valid 16-character Torn API key." }, 400);
    }

    const key = encodeURIComponent(apiKey);
    const infoResponse = await fetch(`https://api.torn.com/v2/key/info?key=${key}`);
    const info = await infoResponse.json();

    if (!infoResponse.ok || info.error) {
      return respond({
        success: false,
        error: info.error?.error || info.error?.message || "Torn could not verify this API key.",
        tornErrorCode: info.error?.code ?? null,
      }, 401);
    }

    const basicResponse = await fetch(`https://api.torn.com/user/?selections=basic&key=${key}`);
    const basic = await basicResponse.json();
    if (!basicResponse.ok || basic.error) {
      return respond({
        success: false,
        error: basic.error?.error || basic.error?.message || "Torn accepted the key, but could not load the basic player profile.",
        tornErrorCode: basic.error?.code ?? null,
      }, 502);
    }

    const infoUser = info.user ?? info.data?.user ?? info.data ?? {};
    const playerId = positiveId(
      infoUser.id, infoUser.user_id, infoUser.player_id,
      info.user_id, info.player_id,
      basic.player_id, basic.user_id, basic.ID, basic.id
    );
    const playerName =
      (typeof basic.name === "string" && basic.name) ||
      (typeof infoUser.name === "string" && infoUser.name) ||
      "SINISTER SICKS Member";

    if (!playerId) {
      return respond({ success: false, error: "Torn accepted the key, but its basic profile response did not contain a player ID." }, 502);
    }

    // Torn's key-info endpoint may omit faction_id for some keys. Query the
    // dedicated user faction selection as a separate membership lookup.
    const factionResponse = await fetch(`https://api.torn.com/v2/user/faction?key=${key}`);
    const factionData = await factionResponse.json().catch(() => ({}));
    const factionObject =
      factionData.faction ??
      factionData.user?.faction ??
      factionData.data?.faction ??
      factionData.data ??
      {};

    const factionId = positiveId(
      infoUser.faction_id,
      info.user?.faction_id,
      factionData.faction_id,
      factionData.faction?.faction_id,
      factionData.faction?.id,
      factionData.faction?.ID,
      factionData.faction_id,
      factionData.user?.faction_id,
      factionData.user?.faction?.faction_id,
      factionData.data?.faction_id,
      factionObject.faction_id,
      factionObject.id,
      basic.faction?.faction_id,
      basic.faction?.id,
      basic.faction_id
    );

    if (!factionId) {
      return respond({
        success: false,
        error: "Torn verified your player ID but returned no faction ID from either key info or the player faction lookup. Check that the API key has the User > Faction selection enabled, then try again.",
        playerId,
        factionLookupError: factionData.error?.error || factionData.error?.message || null,
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

    // Fetch the member's life bar and battle stats. The API key stays here
    // on the server and is never returned to the browser or other players.
    const [barsResponse, battleStatsResponse] = await Promise.all([
      fetch(`https://api.torn.com/v2/user/bars?key=${key}`),
      fetch(`https://api.torn.com/v2/user/battlestats?key=${key}`),
    ]);
    const barsData = await barsResponse.json().catch(() => ({}));
    const battleStatsData = await battleStatsResponse.json().catch(() => ({}));

    if (!barsResponse.ok || barsData.error) {
      return respond({
        success: false,
        error: "Torn could not read your health bar. Your API key must include User > Bars access (Minimal Access or higher).",
        tornErrorCode: barsData.error?.code ?? null,
      }, 403);
    }
    if (!battleStatsResponse.ok || battleStatsData.error) {
      return respond({
        success: false,
        error: "Torn could not read your battle stats. Your API key must include User > Battlestats access (Limited Access or higher).",
        tornErrorCode: battleStatsData.error?.code ?? null,
      }, 403);
    }

    const life = barsData.bars?.life;
    const stats = battleStatsData.battlestats;
    if (!life || !stats?.strength || !stats?.defense || !stats?.speed || !stats?.dexterity) {
      return respond({ success: false, error: "Torn did not return the health and battle-stat fields required by the simulator. Check your API key selections and try again." }, 502);
    }

    return respond({
      success: true,
      playerId,
      playerName,
      factionId: 57348,
      factionName: "SINISTER SICKS",
      healthCurrent: Number(life.current),
      healthMax: Number(life.maximum),
      battleStats: {
        strength: Number(stats.strength.value),
        defense: Number(stats.defense.value),
        speed: Number(stats.speed.value),
        dexterity: Number(stats.dexterity.value),
      },
    });
  } catch (_error) {
    return respond({ success: false, error: "The login service could not reach Torn. Please try again." }, 500);
  }
});
