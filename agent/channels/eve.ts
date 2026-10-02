import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

// Public demo: accept anonymous browser traffic.
// Replace none() with a real AuthFn before handling private/production data.
export default eveChannel({
  auth: [none()],
});
