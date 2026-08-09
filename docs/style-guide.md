# Style Guide

## HTML

- Use semantic HTML5 elements (`<form>`, `<button>`, `<table>`, etc.)
- IDs are preferred for JS hooks (`admin-table`, `rsvp-container`)
- Class names use kebab-case (submit-btn, guest-row, age-badge)
- Forms use `novalidate` with custom validation
- Hidden sections use the `hidden` attribute

## CSS

- Custom properties in `:root` for colors, spacing, radius, font
- Mobile-first single-column layout via flex and a max-width container
- `.card` for bordered white panels with padding
- `.submit-btn` for full-width primary actions
- `.btn-sm` for inline table actions (edit, save, cancel)
- `.logout-btn` for secondary/outline buttons
- Loading state on buttons uses `button:disabled + .spinner` pattern (see Buttons)

## JavaScript

- No framework — vanilla JS with a module-object pattern:
  ```js
  const Module = {
    property: null,
    async init() { ... },
    _privateMethod() { ... },
  };
  ```
- Async/await for all asynchronous operations
- DOM queries via `document.getElementById` / `document.querySelector`
- Event listeners attached after DOMContentLoaded or in method scope
- Fetch for API calls; localStorage fallback for local dev

### Buttons: Loading Indicator Pattern

Any button that triggers a process (web request, file download, async operation) **must** show a loading indicator to give the user feedback.

The standard pattern:

```js
// Save original text
const btn = document.querySelector('#some-form .submit-btn');
const originalText = btn.textContent;

// Disable and show spinner
btn.disabled = true;
btn.innerHTML = '<span class="spinner"></span> Processing...';

// On completion or error, restore
btn.disabled = false;
btn.textContent = originalText;
```

The `.spinner` element (defined in `style.css`) renders a rotating CSS animation. Buttons in `:disabled` state use `display: flex` to center the spinner and text with a `gap`.

#### Buttons covered by this pattern

| Button | File | Trigger |
|--------|------|---------|
| RSVP Submit | `rsvp-form.js:263-272` | `_handleSubmit` (API call) |
| User Sign In | `app.js` | `_handleLogin` (password verify) |
| Admin Sign In | `admin.js` | `_handleLogin` (password hash + API) |
| Admin Edit Save | `admin.js` | `_editRow` save button (API call) |
| Export CSV | `admin.js` | `_exportCSV` (file download) |

## Data

- Guests stored in `/data/guests.json` — array of objects with `id`, `firstName`, `lastName`, `ageGroup`, `householdId`
- Config stored in `/data/config.json` — mealOptions, apiBaseUrl, sitePasswordHash, adminPasswordHash, weddingDate, rsvpDeadline
- RSVP submissions stored via the `API` module in the Azure REST API

## API Module (`js/api.js`)

- Reads and writes RSVP data through the Azure REST API at `apiBaseUrl`
- The browser does not cache RSVP submissions; login session state remains in `sessionStorage`
- Password verification: entered password is SHA-256 hashed and compared with `sitePasswordHash` from config
