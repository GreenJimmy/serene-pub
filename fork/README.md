# This fork's SDK overlay

Read aloud needs a change in serene-pub-sdk (the `sp-read-aloud` host element,
and core's message card placing it) that no published SDK package carries yet.
Until it does, this fork builds the SDK itself:

- `sdk-commit` is the serene-pub-sdk commit the app was built and tested against.
- `sdk-read-aloud.patch` is applied on top of it.

`.github/workflows/docker-fork.yml` checks that commit out as `.serene-pub-sdk`,
applies the patch and builds it; the Dockerfile links it in for the build and
copies it into the image. For local development, do the same in a sibling
`../serene-pub-sdk` checkout, then `npm run sdk:build` and `npm run sdk:link`.

Drop this folder (and the workflow's SDK step) once the SDK ships the change.
