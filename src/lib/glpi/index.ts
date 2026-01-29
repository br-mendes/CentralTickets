import { GlpiLegacyClient } from "./legacy";
import { GlpiHLClient } from "./hl";
import { GlpiTicket } from "@/types/glpi";

type InstanceEnv = {
  instance: "PETA" | "GMX";
  glpiUrl: string;
  apiUrl: string;
  appToken?: string;
  userToken?: string;

  // OAuth2 (opcional)
  oauthClientId?: string;
  oauthClientSecret?: string;
  username?: string;
  password?: string;
};

export function getInstanceEnvs(): InstanceEnv[] {
  const fallbackUser = process.env.GLPI_USER_ADM;
  const fallbackPassword = process.env.GLPI_USER_ADM_PASSWORD;

  const instances: InstanceEnv[] = [];

  const petaUrl = process.env.GLPI_PETA_URL;
  const petaApiUrl = process.env.GLPI_PETA_API_URL;
  if (petaUrl && petaApiUrl) {
    instances.push({
      instance: "PETA",
      glpiUrl: petaUrl,
      apiUrl: petaApiUrl,
      appToken: process.env.GLPI_PETA_APP_TOKEN,
      userToken: process.env.GLPI_PETA_USER_TOKEN,
      oauthClientId: process.env.GLPI_PETA_OAUTH_CLIENT_ID,
      oauthClientSecret: process.env.GLPI_PETA_OAUTH_CLIENT_SECRET,
      username: process.env.GLPI_PETA_USER ?? fallbackUser,
      password: process.env.GLPI_PETA_PASSWORD ?? fallbackPassword,
    });
  } else {
    console.warn(
      "[PETA] Ignorando instância por falta de GLPI_PETA_URL ou GLPI_PETA_API_URL."
    );
  }

  const gmxUrl = process.env.GLPI_GMX_URL;
  const gmxApiUrl = process.env.GLPI_GMX_API_URL;
  if (gmxUrl && gmxApiUrl) {
    instances.push({
      instance: "GMX",
      glpiUrl: gmxUrl,
      apiUrl: gmxApiUrl,
      appToken: process.env.GLPI_GMX_APP_TOKEN,
      userToken: process.env.GLPI_GMX_USER_TOKEN,
      oauthClientId: process.env.GLPI_GMX_OAUTH_CLIENT_ID,
      oauthClientSecret: process.env.GLPI_GMX_OAUTH_CLIENT_SECRET,
      username: process.env.GLPI_GMX_USER ?? fallbackUser,
      password: process.env.GLPI_GMX_PASSWORD ?? fallbackPassword,
    });
  } else {
    console.warn(
      "[GMX] Ignorando instância por falta de GLPI_GMX_URL ou GLPI_GMX_API_URL."
    );
  }

  if (instances.length === 0) {
    throw new Error("Nenhuma instância configurada. Defina GLPI_*_URL e GLPI_*_API_URL.");
  }

  return instances;
}

export async function fetchTicketsForInstance(env: InstanceEnv): Promise<GlpiTicket[]> {
  console.log(`[${env.instance}] Config:`, {
    appToken: !!env.appToken,
    userToken: !!env.userToken, 
    username: !!env.username,
    password: !!env.password,
    oauthClientId: !!env.oauthClientId,
    oauthClientSecret: !!env.oauthClientSecret
  });
  
  // 1) Tenta REST v1 (session token) se tiver appToken + (userToken ou basic)
  if (env.appToken && (env.userToken || (env.username && env.password))) {
    const legacy = new GlpiLegacyClient({
      instance: env.instance,
      apiBase: env.apiUrl.replace(/\/$/, ""),
      appToken: env.appToken,
      userToken: env.userToken,
      username: env.username,
      password: env.password,
    });

    try {
      await legacy.initSession();
      const tickets = await legacy.fetchActiveTickets();
      await legacy.killSession();
      return tickets;
    } catch (e) {
      try { await legacy.killSession(); } catch {}
      // cai pro OAuth se configurado
    }
  }

  // 2) OAuth2 HL (opcional)
  if (env.oauthClientId && env.oauthClientSecret && env.username && env.password) {
    const hl = new GlpiHLClient({
      instance: env.instance,
      glpiUrl: env.glpiUrl.replace(/\/$/, ""),
      clientId: env.oauthClientId,
      clientSecret: env.oauthClientSecret,
      username: env.username,
      password: env.password,
    });
    await hl.authenticate();
    return await hl.fetchActiveTickets();
  }

  throw new Error(
    `Não consegui autenticar ${env.instance}. Configure tokens REST v1 (app+user) ou OAuth2 (client_id/secret).`
  );
}
