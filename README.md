# ARENA ONE

A 1v1 first-person shooter that runs in the browser. You face one computer-controlled rival in a closed neon arena, and the last fighter standing wins. It's built with [three.js](https://threejs.org/), plain JavaScript, HTML and CSS, with no build step.

## Controls

| Key | Action |
| --- | --- |
| ↑ / ↓ | Move forward / back |
| ← / → | Turn |
| Space | Fire plasma |

## Run locally

The game uses ES modules, so serve the folder over HTTP instead of opening `index.html` directly:

```sh
python3 -m http.server 8765
```

Then open http://localhost:8765/ and click **ENTER ARENA**.

An internet connection is needed because three.js and the fonts load from CDNs.

## Files

- `index.html`: page markup, HUD and start overlay
- `game.js`: game logic, rendering and rival AI
- `styles.css`: HUD and overlay styling
