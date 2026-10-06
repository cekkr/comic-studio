# Import fonts

Put each family in a separate folder here, using a lowercase folder name with letters, numbers, hyphens, or underscores. Include the font's original license/usage terms alongside its files.

For example:

```text
public/fonts/my-font/
  font.json
  Regular.ttf
  Bold.ttf
  Italic.ttf
  LICENSE.txt
```

Create `font.json`:

```json
{
  "id": "my-font",
  "name": "My Font",
  "family": "My Font",
  "faces": [
    { "file": "Regular.ttf", "weight": 400, "style": "normal" },
    { "file": "Bold.ttf", "weight": 700, "style": "normal" },
    { "file": "Italic.ttf", "weight": 400, "style": "italic" }
  ]
}
```

Refresh the editor. The family automatically appears in the Typeface menu, and its faces are embedded while exporting images. No source-code edits or server restart are required. Save the project before refreshing to preserve your current work.

Supported files: TTF, OTF, WOFF, WOFF2. Only one face is required; add other weights/styles when available. Weights must be integers from 1–1000; styles can be `normal`, `italic`, or `oblique`. Browser synthesis supplies missing bold/italic combinations.

Use a unique, stable `id` (starting with a lowercase letter, up to 64 lowercase letters/numbers/hyphens/underscores). IDs are saved in projects, so keep the ID unchanged when updating files. `comic`, `sans`, and `serif`, and `mono` are reserved. `family` must be unique and contain letters, numbers, spaces, periods, hyphens, or underscores. File names must refer to files directly in the family folder. Incomplete or invalid manifests are omitted from the catalog until corrected.

The bundled Anime Ace family retains its author's terms in `anime-ace/font info.txt`; those terms are separate from the application license.
