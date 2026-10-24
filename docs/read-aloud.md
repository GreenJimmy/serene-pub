# Read aloud

**Read aloud** speaks a message using the voices your browser already has. Each character gets a voice of their own, and actions such as *she smiles* can be read in a separate narrator's voice, or left out.

:::tip What it's for
- Listening to a long reply instead of reading it.
- Hearing a scene play out, with each character sounding like themselves.
:::

## The basics

1. In a session, find the speaker icon (**Read aloud**) at the top of a message, beside its **⋮**.
2. Press it. The message is read from the start, and the icon becomes a square.
3. Press the square (**Stop reading**) to stop. Starting another message also stops the first.

:::tip You should see
The message is read in a voice picked for that character. The next time one of their messages is read, it's the same voice.
:::

Reading also stops when the message changes under it: you edit it, swipe to another reply, or regenerate it.

:::warning If this didn't work
- **There is no speaker icon.** Your browser has no speech voices, or the message has no text yet (a reply still being written).
- **Nothing is heard.** Check the device's volume. Some browsers load their voices a moment after the page; try again.
- **The voice stops partway through a long reply.** Some browsers cut long speech short. Press the speaker again, or try another browser.
:::

## Choosing voices

Open **Settings** on the rail, on the **User** tab, and find **Read aloud**.

- **Read actions and narration**: **In the narrator's voice** (the default), **In the speaker's voice**, or **Not at all**.
- **What counts as an action**: **Text in *italics*** (the common roleplay style), or **Anything outside quotes** for replies written as prose with dialogue in quotes. A message with no quotes at all is read the italics way, so the character still speaks.
- **Narrator voice**: any voice, or **The speaker's own voice, pitched lower**.
- **Speed**: from half to double.
- **Voices**: every character whose message has been read in this browser, each with **Automatic** or a voice you choose. The speaker button beside a name lets you hear it, and **✕** takes the name off the list.

Out-of-character asides such as *(OOC: brb)*, code and pictures are never read.

## For power users

Your choices are kept **in this browser only**, not on the pub. Which voices exist depends on the device and browser: macOS, Windows, Android and iOS each have their own, and a voice chosen on your computer may not exist on your phone. A character whose chosen voice isn't on this device falls back to an automatic one.

Plugin authors can place read aloud in their own widgets with the `sp-read-aloud` element (see [Widgets](./sdk/guides/widgets.md)).
