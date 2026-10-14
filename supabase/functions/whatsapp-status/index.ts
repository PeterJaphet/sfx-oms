import { whatsappWebhook } from "../_shared/whatsapp.ts";
Deno.serve((request) =>
  whatsappWebhook(request, { env: (key) => Deno.env.get(key), fetch }),
);
