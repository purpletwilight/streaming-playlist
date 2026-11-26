# Cross-Stream Playlist

One autoplay queue for your favorite videos across **Paramount+, Disney+, HBO Max and Peacock**
(any other site with a direct video link works too).

## Quick start

1. Run `npm start` (or `python3 -m http.server 8080`) and open http://localhost:8080.
   It's a static page, so GitHub Pages or any web host works too.
2. In each streaming service, open the episode/movie, start it, and **copy the address-bar URL**.
3. Paste it into **Add a video**. The service is detected from the link; enter the **runtime**
   (`42`, `42m`, `1h 58m`, `1:58:00`) and optionally **Skip first** (e.g. `1:30` if the link resumes past the intro).
4. Press **▶ Play**. A **player window** opens; move it to your TV or second screen and make it full screen.
   When an item's runtime is up, the same window jumps to the next video.

Sign in to each service once in your browser so its links play straight away.

## Features

- Mixed-service queue with color-coded service badges
- Auto-advance, Prev/Next, pause and resume, Loop, Shuffle
- Reorder by dragging or with the ↑/↓ buttons; ▶ on a row plays from that video
- **Credits buffer**: add or remove minutes on every item (for example `-2` cuts end credits)
- **Up-next warning**: an on-page message and desktop notification a few seconds before the switch
- Saved in your browser automatically. **Export/Import** JSON to back up or share
  (see `examples/sample-playlist.json`)
- Keyboard: `Space` play/pause · `→`/`n` next · `←`/`p` previous

## Why a separate player window (and why runtimes)?

Paramount+, Disney+, HBO Max and Peacock use DRM and don't let other sites embed their player.
Their pages also don't tell other pages when a video ends. So this app:

- opens videos in one named window and changes that window's address for each new video, and
- uses the runtime you enter to decide when to move on.

**If you pause the video, pause the playlist too** (Space). The playlist timer can't see the player.

### If the next video doesn't open by itself

Some sites cut the link between the playlist and the player window when they load. If that happens,
the playlist chimes, sends a notification and shows **▶ Continue**. Click it to open the next video.
To avoid this, **allow pop-ups for the playlist page** in your browser's site settings. The next video
then opens automatically (in a new window, so close the old one).

## Development

```
npm test   # unit tests for parsing, service detection, shuffle and import validation
```

Files: `index.html` (UI), `styles.css`, `app.js` (player/controller), `playlist-core.js` (pure logic shared with the tests).
