# GitHub Workflow

Default repo: `your-github-username/the assistantTPplugin` on branch `main`.

## Writing files to GitHub

Use `write_and_commit` for the common case — writes the file and commits in one call:
- `owner`: your-github-username (default)
- `repo`: the assistantTPplugin (default, override as needed)
- `path`: file path within the repo
- `content`: full file content as a string
- `message`: commit message

Use `github_write_file` when you need more control (different branch, explicit SHA).

## Reading from GitHub

Use `github_read_file` to read a file before updating it (needed to get the current SHA).
Use `github_list_files` to see what's in a directory.

## Multiple files

Call `write_and_commit` once per file. Do not batch — each call is one atomic commit.

## When to commit

Commit after every logical unit of work. Don't wait until everything is done.
