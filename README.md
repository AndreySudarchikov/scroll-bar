# scroll-bar

Custom scrollbar Web Component built on top of **native scrolling**.  
Built with **vanilla JavaScript** — no frameworks, no dependencies.


The component **does not control layout or positioning**.
The **size and position of `<scroll-bar>` are fully defined by the developer**.

This makes the behavior explicit, predictable, and easy to integrate into any layout.

---

## Key principles

* Uses **native scroll** (`scrollTop / scrollLeft`)
* Does **not replace** scrolling logic
* `<scroll-bar>` is a visual + interaction layer only
* Positioning and sizing are **your responsibility**
* Styling via CSS variables and `::part`

---

## Basic usage

```html
<div class="container">
  
  <div class="content" data-scrollbar-scroller>
    ...
  </div>

  <scroll-bar></scroll-bar>

</div>
```

```css
.container {
  position: relative;
}

scroll-bar {
  position: absolute;
  width: 20px; height: 20px;
}

scroll-bar:not([data-horizontal]) { 
  right: 0; 
  top: 0; 
  height: 100% 
}

scroll-bar[data-horizontal] { 
  left: 0; 
  bottom: 0; 
  width: 100% 
}
```

---

## JavaScript API

```js
import { ScrollBar } from './scroll-bar.js';

const bar = ScrollBar(scroller);        // return <scroll-bar> vertical Element
const bar = ScrollBar(scroller, true);  // return <scroll-bar data-horizontal> horizontal  Element
```

The helper only creates the element.
You decide **where and how** to insert it.

---

## Scroller resolution

The component supports multiple ways to define the scroller element.

### 1️⃣ Explicit scroller (JavaScript)

```js
ScrollBar(scrollerElement);
```

or

```js
ScrollBar('.scroll-container');
```

Explicitly assigns a scroller and skips automatic resolution.

---

### 2️⃣ Scroller via target element attribute

```html
<div data-scrollbar-scroller>
  ...
</div>

<scroll-bar></scroll-bar>
```

The scrollbar automatically attaches to the element marked with
`data-scrollbar-scroller`.

---

### 3️⃣ Scroller via `<scroll-bar>` attribute

```html
<div id="content_scroller">
  ...
</div>

<scroll-bar data-scroller="#content_scroller"></scroll-bar>
```

The `data-scroller` value must be a valid CSS selector.
Equivalent to calling `setScroller(selector)`.




---

### 3️⃣ Auto-detection (default)

If no scroller is provided, `<scroll-bar>` will search:

* parent elements
* direct children of parents

for an element with:

```html
data-scrollbar-scroller
```

---

## Layout examples

### ✅ Page scroll (document)

```html
<body data-scrollbar-scroller>
  <scroll-bar></scroll-bar>
</body>

<style>
scroll-bar {
  position: fixed;
}
/* here scroll-bar size and position rules */
</style>
```

---

### ✅ Vertical scrollbar for a block

```html
<div class="box">
  <div class="content" data-scrollbar-scroller>
    ...
  </div>

  <scroll-bar></scroll-bar>
</div>
```

```css
.box {
  position: relative;
  height: 300px;
}

.content {
  overflow-y: auto;
}

scroll-bar {
  position: absolute;
}
/* here scroll-bar size and position rules */
```

---

### ✅ Horizontal scrollbar

```html
<div class="box">
  <div class="content" data-scrollbar-scroller>
    ...
  </div>

  <scroll-bar data-horizontal></scroll-bar>
</div>
```

---

### ✅ Both directions

```html
<div class="box">
  <div class="content" data-scrollbar-scroller>
    ...
  </div>

  <scroll-bar></scroll-bar>
  <scroll-bar data-horizontal></scroll-bar>
</div>
```

```css
.box {
  position: relative;
}

scroll-bar {
  position: absolute;
  width: 20px; height: 20px;
}

scroll-bar:not([data-horizontal]) { 
  right: 0; 
  top: 0; 
  height: 100% 
}

scroll-bar[data-horizontal] { 
  left: 0; 
  bottom: 0; 
  width: 100% 
}
```

---

## Hiding native scrollbars

To avoid double scrollbars, native scrollbars should be hidden manually.

### CSS helper

```css
:root, /* optional to hide page scrollbars */
.hide-scrollbars, /* additional helper optional*/
[data-scrollbar-scroller] {
    -ms-overflow-style: none;  /* Hide native scrollbars IE and Edge */
    scrollbar-width: none;  /* Hide native scrollbars Firefox */
}

:root::-webkit-scrollbar, /* optional to hide page scrollbars */
.hide-scrollbars::-webkit-scrollbar, /* additional helper optional*/
[data-scrollbar-scroller]::-webkit-scrollbar {
    display: none; width: 0; height: 0;  /* Hide native scrollbars Webkit */
}
```

Apply either:

* `.hide-scrollbars`
* or rely on `[data-scrollbar-scroller]`

---

## Styling

Visual appearance is customizable via CSS variables and `::part`.

### CSS variables

```css
scroll-bar {
  --track-color: rgba(0,0,0,0.3);
  --thumb-color: rgba(255,255,255,1);
  
  --track-width: 4px;
  --track-radius: 2px;
  
  --thumb-width: 8px;
  --thumb-radius: 4px;
  
  --thumb-minsize: 50;
  --thumb-opacity: 1;
  --thumb-hover-opacity: 1;
  --thumb-hover-scale: 2;

  --transition-duration: 0.3s; 
}
```

### Parts

```css
scroll-bar::part(track) {
  border-radius: 4px;
}

scroll-bar::part(thumb) {
  border-radius: 8px;
}
```

---

## Notes

* `<scroll-bar>` does not enforce layout decisions
* **Parent positioning (`position: relative/absolute/fixed`) is required**
* Native smooth scrolling is used only for track clicks
* Dragging always uses direct scroll updates

---




# Component Methods

## `scrollTo(progress, behavior = 'auto')`

Programmatically scrolls the associated scroller using native browser scrolling, with optional smooth behavior.

### Usage

```js
bar.scrollTo(0);           // start
bar.scrollTo(0.5);         // middle
bar.scrollTo(1, 'smooth'); // end with smooth scrolling
```

### Parameters

* **progress** — `number` in range `0…1`

  * `0` → start
  * `1` → end

* **behavior** — `'auto' | 'smooth'`
  Uses native `scrollTo({ behavior })`

### Notes

* Scroll direction is defined by `data-horizontal`
* Values are clamped internally
* Dragging always uses direct (non-smooth) scrolling

---

## `setScroller(scroller)`

Explicitly assigns a scroller element.

### Usage

```js
bar.setScroller(element);
bar.setScroller('.scroll-container');
```

### Parameters

* **scroller** — `HTMLElement` or CSS selector `string`

### Behavior

* If `document.body` is passed, `document.scrollingElement` is used
* Triggers immediate re-render
* Use this when you want full control from JavaScript
  (auto-detection is skipped)

---

## `resolveScroller()`

Resolves a scroller element automatically based on DOM structure.

This method is called internally if no scroller is provided.

### Resolution Logic

* Walks up the DOM tree
* Checks parent elements and their direct children
* Searches for an element with attribute:

```html
data-scrollbar-scroller
```

### Returns

* **HTMLElement** — resolved scroller
* **null** — if nothing is found

> You normally don’t need to call this method manually.



## License

MIT

© Andrey Sudarchikov
[https://github.com/AndreySudarchikov](https://github.com/AndreySudarchikov)
