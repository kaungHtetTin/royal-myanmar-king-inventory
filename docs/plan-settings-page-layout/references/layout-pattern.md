# Inventory App Settings Layout Pattern

## Core Anatomy

The reference application uses a bounded settings workspace rather than a long page of unrelated cards:

```text
Page heading
Status feedback
Settings workspace
|-- Section index (desktop sidebar / mobile horizontal rail)
`-- Active editor
    |-- Section heading
    |-- Primary field grid
    |-- Optional subsections or previews
    `-- Section save bar
```

The page is centered with a large-screen maximum width near `1400px`. The workspace is a bordered surface with a minimum working height near `520px`.

## Desktop Layout

- Use `grid-template-columns: 220px minmax(0, 1fr)` for the section index and editor.
- Put `min-width: 0` on the editor so wide content cannot force document overflow.
- Keep the index visually quieter than the editor through a soft surface color and right divider.
- Give each index item an icon, short title, and one-line description.
- Mark the selected item semantically with `aria-current="page"` or the equivalent tab state.
- Render one active editor section at a time.
- Use a two-column form grid for ordinary fields and a full-span modifier for addresses, notes, and other wide controls.

## Editor Composition

Start each section with an eyebrow, title, and concise outcome-oriented description. Keep the description width limited for readability.

Use subsections when fields form a distinct task, carry higher risk, or need explanatory context. A subsection header may contain an icon, title, helper copy, and a right-aligned action.

Use previews beside controls only when immediate visual feedback materially helps, such as branding or print configuration. At medium widths, stack the preview below the fields.

Use repeatable rows for collections such as payment methods. Each row should expose its identity, editable values, boolean policy, and row action without requiring a separate detail screen when the model is small.

## Save Ownership

Prefer one save bar per server-persisted section. The bar should state the impact of saving and carry one obvious primary action. Disable it while saving and report success or failure without discarding the user's inputs.

Do not show a server-save bar for a device preference that persists immediately in local storage. Explain its device scope in the section heading.

If navigation can discard unsaved edits, plan dirty-state detection and either preserve drafts or ask for confirmation before switching sections.

## Responsive Behavior

At roughly `1050px`:

- retain the indexed two-column workspace;
- stack complex inner grids such as fields plus live preview;
- collapse three-column password or asset grids to one column when necessary.

At roughly `760px`:

- change the workspace to one column;
- turn the section index into a sticky, horizontally scrollable rail below the application top bar;
- hide the index heading to preserve vertical space;
- give navigation items a stable touch-friendly width and height;
- collapse all form grids to one column;
- stack the save-bar explanation and action, making the action full-width or easily reachable;
- remove desktop-only side borders and avoid document-level horizontal overflow.

Follow the target application's existing breakpoints rather than copying these numbers blindly.

## State and Permission Plan

For each section, specify:

- initial loading and retry behavior;
- field-level and form-level validation;
- server failure without input loss;
- saving/disabled state;
- success confirmation and duration;
- read-only presentation when view access exceeds edit access;
- hidden versus disabled behavior for unauthorized controls;
- concurrency or stale-data behavior if multiple administrators can edit the same values.

## Recommended Planning Deliverable

Use a compact table for the section map:

| Section | User goal | Scope | Fields/components | Save model | Permission |
|---|---|---|---|---|---|

Then document:

1. workspace hierarchy;
2. desktop, medium, and mobile behavior;
3. shared components and state ownership;
4. API/data dependencies;
5. validation and feedback states;
6. phased implementation order;
7. acceptance checks.

Keep the plan aligned with existing code. Cite real component and stylesheet paths when planning inside a repository.

## Acceptance Checks

- Section labels remain understandable without icons.
- Keyboard focus follows section changes logically.
- The active section is announced semantically.
- Long translations and increased font scale remain usable.
- Field errors do not shift controls into overlap.
- Save actions describe their scope and remain reachable.
- Device-local and organization-wide effects are clearly distinguished.
- Mobile navigation is sticky without covering content.
- No section causes document-level horizontal overflow.
- Permission and destructive-action behavior are explicit.
