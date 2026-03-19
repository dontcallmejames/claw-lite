# Touch Portal Plugin

the owner's Touch Portal plugin repo: `your-github-username/the assistantTPplugin`

## entry.tp structure

`entry.tp` is the plugin descriptor JSON. Key fields:
- `sdk`: 6
- `version`: integer (increment on each release)
- `name`: plugin display name
- `id`: unique plugin ID string
- `plugin_start_cmd`: command to start the plugin
- `actions`: array of action objects
- `states`: array of state objects
- `events`: array of event objects

## Adding an action

```json
{
  "id": "davos.action.name",
  "name": "Display Name",
  "prefix": "the assistant",
  "type": "communicate",
  "description": "What it does",
  "format": "Action label {$davos.action.name.param$}",
  "data": [
    {
      "id": "davos.action.name.param",
      "type": "text",
      "label": "Param label",
      "default": ""
    }
  ]
}
```

## States

States hold values that Touch Portal can display or use in logic:
```json
{
  "id": "davos.state.name",
  "type": "text",
  "desc": "Description",
  "default": "Default value"
}
```

## Plugin logic is in `index.js`

Handles WebSocket connection to the assistant gateway (ws://localhost:8080).
Kill switch action disconnects and reconnects after 2s.
Auto-reconnects every 10s on disconnect.
