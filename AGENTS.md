<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application structure
- Keep the three portfolio pages as separate TanStack routes with shared navigation and footer in the root layout, so each page can be linked and indexed independently.
- Use the shared portfolio module for sample projects and project previews, keeping the same selection consistent across pages.
- Contact only prepares and copies a message until real contact details are supplied; do not imply that a message has been sent.
