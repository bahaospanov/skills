// `$ARGUMENTS` is the hook input as JSON.

export const STATIC_TEXT = `Reviewer for a UI TEST. $ARGUMENTS
added_assertions are the lines this write added to test_file that check literal text; test_source is the whole test file after the write; subject_source, when present, is the component or page beside it that the test most likely renders.
Judge ONLY added_assertions. Do not judge style, naming or coverage, and never whether the test file should exist.
The question, for each added assertion: does it only check that text the component always shows is there - copy written into its markup or a constant, the same whatever props, state, data or user action? Such a check types the copy a second time: every wording change edits two files, and the test fails only when someone changed the wording on purpose.
If YES for any added assertion -> ok=false.
It is NOT static, so ok=true for that assertion, when ANY of these hold:
- the text comes from props, fixtures, mocks or fetched data the test sets up, or is computed: a name, a total, a count, a date, a formatted amount, a plural form;
- it appears, disappears or changes with something the test does or chooses: a click, typing, a timer, a route, a viewer's role, an empty, loading or error state, a feature flag;
- the query only finds an element the test then clicks, types into, or checks something else about (its href, disabled state, a wrapper such as data-nosnippet), and that something else is the point.
Rendering with no props and asserting fixed strings with toBeInTheDocument, toBeVisible or toHaveTextContent is the usual static case, and so is a snapshot of a component rendered with nothing varied. Text in another language, an accessible name or a button label is still copy, not behaviour.
Reason: name the test by its it/test title and one or two of its strings, say to delete those assertions, or the test when nothing else is left, rather than update them, and to keep only checks of what props, state, data or an action decide. Under 50 words, no preamble.`
