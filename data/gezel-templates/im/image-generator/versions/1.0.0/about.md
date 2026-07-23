## What this gezel does

This gezel is a **pass-through to image generation**. There's no LLM behind it — when you @mention them with a prompt, the message goes straight to the configured image engine and the result lands in chat.

## How to use it

Type the prompt you'd give to a stable-diffusion-like model:

> @{name} two horses jumping a cow, oil on canvas, dramatic lighting

The image is saved into your project's `artifacts/generated/` folder and rendered inline in the chat bubble. To iterate, ask again with a new prompt — there's no conversation memory because there's no model on this side of the wire.

## Settings

This gezel has no `about.md` to edit (no system prompt). The image engine + model are picked in Settings → Image generation. Per-gezel defaults — width, height, sampling steps, model id — are editable in the gezel's edit dialog under "Default arguments".
