-- Custom SQL migration file, put your code below! ---- The "Backroom/Daily Counts" section was permanently retired from the checklist, so it no
-- longer belongs in the list of removed (restorable) sections.
DELETE FROM "removed_sections" WHERE "name" = 'Backroom/Daily Counts';
