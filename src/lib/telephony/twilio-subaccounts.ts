/**
 * Utilidades para gestionar subcuentas de Twilio.
 */

function masterCredentials(): { accountSid: string; authToken: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
}

function authHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

export interface TwilioSubaccount {
  sid: string;
  authToken: string;
  friendlyName: string;
  status: string;
  dateCreated: string;
}

/** Crea una nueva subcuenta en Twilio usando las credenciales master. */
export async function createTwilioSubaccount(friendlyName: string): Promise<TwilioSubaccount> {
  const master = masterCredentials();
  if (!master) {
    throw new Error("Credenciales master de Twilio no configuradas");
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts.json`, {
    method: "POST",
    headers: {
      Authorization: authHeader(master.accountSid, master.authToken),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ FriendlyName: friendlyName }).toString()
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Error creando subcuenta Twilio: ${json.message || res.statusText}`);
  }

  return {
    sid: json.sid,
    authToken: json.auth_token,
    friendlyName: json.friendly_name,
    status: json.status,
    dateCreated: json.date_created
  };
}

/** Obtiene los detalles de una subcuenta existente. */
export async function getTwilioSubaccount(subaccountSid: string): Promise<TwilioSubaccount> {
  const master = masterCredentials();
  if (!master) {
    throw new Error("Credenciales master de Twilio no configuradas");
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${subaccountSid}.json`, {
    method: "GET",
    headers: {
      Authorization: authHeader(master.accountSid, master.authToken)
    }
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Error obteniendo subcuenta Twilio: ${json.message || res.statusText}`);
  }

  return {
    sid: json.sid,
    authToken: json.auth_token,
    friendlyName: json.friendly_name,
    status: json.status,
    dateCreated: json.date_created
  };
}
