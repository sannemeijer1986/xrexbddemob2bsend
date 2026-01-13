# XRex B2B — Send Payment (HTML/SCSS/JS)

Simple static project scaffolding to implement the “Send payment” screen.

## Prerequisites
- Node.js 18+

## Install
```bash
npm install
```

## Develop (Sass watcher)
```bash
npm run watch:css
```
- Compiles `src/scss/main.scss` to `public/css/main.css` with source maps.
- Open `index.html` directly in a browser or via a local server.

## Edit CSS and mirror into SCSS (optional)
If you prefer to tweak plain CSS and have it reflected in SCSS:
```bash
npm run dev:with-css-edit
```
- Edit `src/css/overrides.css`. Changes are mirrored to `src/scss/_overrides.scss`, which is imported by `main.scss`.
- Avoid running this alongside other tools that also write to `src/scss/_overrides.scss`.

## Build once
```bash
npm run build:css
```
- Outputs a minified `public/css/main.css`.

## Structure
```
src/
  js/
    main.js
  scss/
    _variables.scss
    _mixins.scss
    _base.scss
    _layout.scss
    _forms.scss
    _buttons.scss
    _components.scss
    main.scss
public/
  css/            # compiled output (gitignored)
index.html
```

## Notes
- Styles are written in SASS SCSS with a small design-token layer in `_variables.scss`.
- The page approximates the Figma “B2B — Send payment” layout; adjust variables and components to match any updated tokens from design.
