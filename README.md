# 🛕 Mahakaleshwar Aarti Booking Autofill

A Chrome extension to save devotee details (full name, age, gender, ID proof =
Aadhaar Card, Aadhaar number) and autofill them into the Shri Mahakaleshwar
aarti booking form (Bhasma / Sandhya / Shayan aarti).

## What it does

- **Save many devotees** — name, age, gender, ID proof type (defaults to Aadhaar
  Card), and Aadhaar number. Data is stored locally in your browser only
  (`chrome.storage.local`), never sent anywhere.
- **One-click fill** — on the booking page, click **Fill** next to a devotee
  (either from the toolbar popup or the floating 🛕 panel on the page) and the
  form fields are populated for you.
- **Smart field matching** — fields are found by their labels/placeholders, so
  it keeps working even if the site tweaks its HTML.
- **Aadhaar validation** — checks the 12-digit Verhoeff checksum so you don't
  save a typo.

## Install (Load unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder:
   `C:\Users\tvish\Downloads\Ujjain_Booking_Autofill`
4. The 🛕 icon appears in the toolbar. Pin it for convenience.

## Use

1. Click the toolbar icon → add each devotee → **Save devotee**.
2. Go to https://www.shrimahakaleshwar.mp.gov.in/services/shayan-aarti
   (or the bhasma / sandhya aarti page) and reach the devotee-details form.
3. Click into the row you want to fill (or just let it pick the first empty
   row), then click **Fill** for the right devotee — from the popup or the
   floating 🛕 panel at the bottom-right of the page.
4. Review the filled values, add more rows / devotees as needed, and submit.

> The extension fills **one devotee per click** into the currently focused (or
> first empty) row. For multiple devotees: fill row 1, click the site's
> "Add more" button, focus the new row, fill the next devotee, and so on.

## If a field doesn't get filled

The site's exact field names aren't hardcoded — they're matched by keywords. If
some field is missed (e.g. the site uses an unusual label), capture the real
field info so the keyword list can be extended:

1. On the booking page, right-click the field → **Inspect**.
2. In the Elements panel, note the `<input>`/`<select>`'s `id`, `name`, and the
   text of its `<label>`.
3. Send me those, and I'll add the keyword to `content.js` → `KW` lists.

You can also self-edit: open `content.js`, find the `KW` object near the top,
and add the missing label keyword (lowercase) to the relevant array, then click
**Reload** on the extension card in `chrome://extensions`.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) |
| `popup.html/.css/.js` | Toolbar UI to add/edit/delete devotees |
| `storage.js` | Storage helpers + Aadhaar formatting/validation |
| `content.js` | Field-matching + fill logic + on-page panel |
| `content.css` | Styles for the on-page panel & toast |
| `icons/` | Toolbar icons |

## Privacy

All data stays in your browser's local extension storage. Nothing is uploaded.
Aadhaar numbers are sensitive — only use this on your own machine.
