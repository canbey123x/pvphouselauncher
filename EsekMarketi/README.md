# ShopSim 3D

A walking simulator set in an Indian supermarket, built with Three.js in plain JavaScript. You get a shopping list, find each item across eight store sections, compare prices and check out.

**Play it in the browser:** https://ishu-dev.github.io/shop-sim-3d/

| Isometric camera | Third-person camera |
|---|---|
| ![Isometric view](docs/iso.png) | ![Third-person view](docs/third_person.png) |

## What's in it
- A store of about 60 by 44 units with Produce, Bakery, Dairy, Snacks, Beverages, Frozen, Household and Jewellery sections, each with colour-coded floors and signs
- Shelves stocked with priced products; press F on an item for a buying tip (the diamond ring asks you to check the 4 Cs)
- An animated low-poly shopper and five cameras: isometric, third-person, top-down, free orbit and first-person
- A minimap and an arrow that points to the next item on your list
- A checkout counter with a queue of NPC shoppers and a cashier, plus coins to collect

About 1,300 lines in `js/game.js`. No build step, no framework, no network calls; Three.js is vendored as `three.min.js`.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Move, relative to the camera |
| Shift | Sprint |
| E | Pick up a product, use the checkout |
| F | Inspect a product up close |
| C or the on-screen buttons | Change camera |
| Mouse drag / scroll | Orbit and zoom (free camera) |
| M | Minimap |
| Tab | Shopping list |

## Run locally
Open `index.html` in a browser. It works from the file system with no server.

Three.js is MIT-licensed; its licence travels inside `three.min.js`.
