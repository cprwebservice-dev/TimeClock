# Time-Clock Enterprise V5.6.1 — Shift & Review Bug Fix

## Fixed

- Fixed missing `ta_assign_shift_single` RPC used by the assignment modal.
- Fixed missing `ta_assign_shifts_bulk` RPC used by quick assign, paste, confirm, clear, undo and redo.
- Fixed delete assignment through `ta_delete_shift_assignments_bulk`.
- Fixed Shift Master save compatibility through `ta_upsert_shift_master`.
- Removed duplicate Schedule event bindings that caused the same action to run twice.
- Schedule cells now open the edit modal by double-click only; single click remains available for multi-select.
- Removed the Review Center `MutationObserver` render loop that caused continuous loading and blank data.
- Added a 30-second timeout and direct-table fallback for Review Queue.
- Added the `LV` shift master record so the existing LV quick action can be saved.
- Added assignment audit logging and PostgREST schema cache reload.

## Required deployment order

1. Run `sql/V5.6.1_SHIFT_REVIEW_BUGFIX.sql` in Supabase SQL Editor.
2. Upload this web package over V5.6 on GitHub Pages.
3. Wait for deployment and press Ctrl + Shift + R.
