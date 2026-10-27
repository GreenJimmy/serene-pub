# Read aloud

**Read aloud** speaks a message using the pub's OpenVox voices when the pub has them, or the voices your browser already has. Each character gets a voice of their own, and actions such as _she smiles_ can be read in a separate narrator's voice, or left out.

:::tip What it's for

- Listening to a long reply instead of reading it.
- Hearing a scene play out, with each character sounding like themselves.
  :::

## The basics

1. In a session, find the speaker icon (**Read aloud**) at the top of a message, beside its **⋮**.
2. Press it. The message is read from the start, and the icon becomes a square. With OpenVox voices it spins for a moment first, while the pub makes the audio.
3. Press the square (**Stop reading**) to stop. Starting another message also stops the first.

:::tip You should see
The message is read in a voice picked for that character. The next time one of their messages is read, it's the same voice.
:::

Reading also stops when the message changes under it: you edit it, swipe to another reply, or regenerate it.

:::warning If this didn't work

- **There is no speaker icon.** Your browser has no speech voices and the pub has no OpenVox voices, or the message has no text yet (a reply still being written).
- **Nothing is heard.** Check the device's volume. Some browsers load their voices a moment after the page; try again.
- **The icon spins, then stops without a sound.** The pub couldn't reach OpenVox. Check that OpenVox is running with its API on, or switch to **This browser's voices** in settings.
- **The voice stops partway through a long reply.** Some browsers cut long speech short. Press the speaker again, or try another browser.
  :::

## Choosing voices

Open **Settings** on the rail, on the **User** tab, and find **Read aloud**.

- **Voices to read with**: **OpenVox** (the default) or **This browser's voices**. Only shown when the pub has OpenVox voices. Each has its own voice choices below.
- **Read actions and narration**: **In the narrator's voice** (the default), **In the speaker's voice**, or **Not at all**.
- **What counts as an action**: **Text in _italics_** (the common roleplay style), or **Anything outside quotes** for replies written as prose with dialogue in quotes. A message with no quotes at all is read the italics way, so the character still speaks.
- **Narrator voice**: any voice, or **The speaker's own voice, pitched lower**.
- **Speed**: from half to double.
- **Voices**: every character whose message has been read in this browser, each with **Automatic** or a voice you choose. The speaker button beside a name lets you hear it, and **✕** takes the name off the list.

Out-of-character asides such as _(OOC: brb)_, code and pictures are never read.

## For power users

Your choices are kept **in this browser only**, not on the pub. Which voices exist depends on the device and browser: macOS, Windows, Android and iOS each have their own, and a voice chosen on your computer may not exist on your phone. A character whose chosen voice isn't on this device falls back to an automatic one.

With OpenVox, a whole message comes back as one recording, so it keeps playing with the screen locked, and the lock screen's pause button (or a car's) stops it.

### Setting up OpenVox

OpenVox is a voice app for Macs with an OpenAI-compatible API. The pub calls it, not your browser, so OpenVox only needs to be reachable from the pub, and read aloud works from anywhere the pub does.

1. In OpenVox, download a voice model in the **Model Manager**, then start the API under **Local API + MCP**.
2. Set these on the pub, then restart it:
    - `OPENVOX_URL`: the API's address, ending in `/v1`, e.g. `http://192.168.1.11:8003/v1`.
    - `OPENVOX_MODEL`: the model to read with. Defaults to `pocket-tts`.

OpenVox's API only listens on its own Mac (`127.0.0.1`). If the pub runs on another machine, relay the port onto the Mac's network address, for example with `socat TCP-LISTEN:8003,bind=192.168.1.11,reuseaddr,fork TCP:127.0.0.1:8003`.

OpenVox has no password, so anyone who can reach its port can use it. The pub only reads aloud for people signed in to it.

Plugin authors can place read aloud in their own widgets with the `sp-read-aloud` element (see [Widgets](./sdk/guides/widgets.md)).
