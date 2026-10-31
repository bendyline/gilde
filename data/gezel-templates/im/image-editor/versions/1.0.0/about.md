## What this gezel does

This gezel is a **pass-through to image editing**. There's no LLM behind it: attach a picture to your message and say what to change, and the picture and your words go straight to an image model that edits. The result lands in chat.

## How to use it

Attach a picture, then write the change the way you'd ask a person:

> @{name} remove the people in the background

To keep going, send the next change without a picture and it edits the last result. Attach up to three pictures to combine them ("put the hat from the second picture on the dog in the first").

A message without a picture, when there's no earlier result in the thread, is turned away: this gezel never draws from words alone.

## Settings

The model is picked in Settings → Image generation. On this computer that needs a model that can edit, such as Qwen Image Edit or FLUX.2 Klein. The result keeps the picture's shape unless you pick another in the strip above the message box.
