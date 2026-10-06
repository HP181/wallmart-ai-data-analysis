import { defineAgent } from "eve";
import { openai } from "eve/models/openai";
import { MODEL_ID } from "@/lib/app-info";

export default defineAgent({
  model: openai(MODEL_ID),
});
