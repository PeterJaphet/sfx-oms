import { dispatchReports } from "../_shared/whatsapp.ts";
Deno.serve((request) =>
  dispatchReports(request, { env: (key) => Deno.env.get(key), fetch }),
);
