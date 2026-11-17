# This fork's SDK overlay

The "Back to the start of this message" arrow needs a change in
serene-pub-sdk (core's message card drawing the link) that no published SDK
package carries yet. It is offered upstream; until it ships, this fork builds
the SDK itself:

- `sdk-commit` is the serene-pub-sdk commit the app is built against
  (v0.6.0-pr-8).
- `sdk-jump-to-start.patch` is applied on top of it.

`.github/workflows/docker-fork.yml` checks that commit out as `.serene-pub-sdk`,
applies the patch and builds it; the Dockerfile links it in for the build and
copies it into the image. For local development, do the same in a sibling
`../serene-pub-sdk` checkout, then `npm run sdk:build` and `npm run sdk:link`.

Drop this folder (and the workflow's SDK step) once the SDK ships the change.
