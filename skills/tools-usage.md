## Tools Usage Guide
This document outlines how to use various functions provided by the assistant to interact with files, GitHub repositories, and system resources.
### Functions
The available functions are listed below along with their descriptions and usage examples:
1. **read_file**: Reads the contents of a file from the workspace.
   - Usage: `read_file(path='/path/to/file')`
2. **write_file**: Writes content to a local file in the workspace.
   - Usage: `write_file(path='/path/to/file', content='New file contents.')`
3. **edit_file**: Finds and replaces text within a file.
   - Usage: `edit_file(path='/path/to/file', find='old_text', replace='new_text')`
4. **list_files**: Lists files in a directory of the workspace.
   - Usage: `list_files(path='/path/to/directory')`
5. **system_monitor**: Monitors system resources such as CPU, RAM, disk space, etc.
   - Usage: `system_monitor(metric='cpu')`
6. **remember**: Saves information to long-term memory for persistence across sessions.
   - Usage: `remember(value='Python', type='preference', key='favorite_language')`
7. **recall**: Retrieves saved information from long-term memory.
   - Usage: `recall(key='favorite_language')`
8. **execute_shell**: Executes a shell command in the environment.
   - Usage: `execute_shell(command='ls -la')`
9. **get_config**: Reads the current assistant configuration from disk.
   - Usage: `get_config()`
10. **write_and_commit**: Writes and commits content to a file in a GitHub repository.
    - Usage: `write_and_commit(path='/path/to/file', content='New contents.', message='Add index.js')`
11. **github_read_file**: Reads a file from a GitHub repository.
    - Usage: `github_read_file(owner='username', repo='repo-name', path='src/index.js')`
12. **github_list_files**: Lists files and directories in a GitHub repository path.
    - Usage: `github_list_files(owner='username', repo='repo-name')`
13. **github_write_file**: Creates or updates a file in a GitHub repository.
    - Usage: `github_write_file(owner='username', repo='repo-name', path='/path/to/file', content='New contents.', message='Add README.md')`
14. **github_delete_file**: Deletes a file from a GitHub repository.
    - Usage: `github_delete_file(owner='username', repo='repo-name', path='/path/to/file', message='Delete config.js')`
15. **github_create_repo**: Creates a new GitHub repository under the authenticated user.
    - Usage: `github_create_repo(name='new-repo', auto_init=True, description='Description of new repo.')`

For detailed documentation on each function, please refer to their specific descriptions and examples.