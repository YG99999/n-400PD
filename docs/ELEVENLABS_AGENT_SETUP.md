# ElevenLabs Agent Setup

CitizenFlow now expects one private ElevenLabs conversational agent for the main intake flow.

Current provisioned remote agent:

- `agent_5501kkjmqrzreharr1hggpa4jpyx` (`CitizenFlow N-400 Voice Intake`)

## Required environment variables

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_SERVER_LOCATION`
- `ELEVENLABS_WEBHOOK_SECRET` if you enable webhook delivery

## Agent prompt baseline

The app sends a dynamic prompt override on every session start. In the ElevenLabs dashboard, keep the saved agent prompt minimal and let the app-provided override lead.

Recommended saved prompt:

> You are CitizenFlow's calm N-400 intake guide. Use the configured tools, ask one focused question at a time, and never invent legal facts.

## Client tools to configure in ElevenLabs

Create these client tools in the dashboard with matching names:

- `get_form_state`
- `update_form_fields`
- `mark_section_complete`
- `reopen_section`
- `run_readiness_check`
- `transition_to_review`
- `transition_to_payment`
- `switch_to_text_mode`
- `navigate_to_review`
- `navigate_to_payment`
- `show_missing_fields`

Mark any tool as blocking if the agent should wait for the returned JSON before continuing.

These tools have already been provisioned remotely for the current workspace and are also tracked locally in [`tools.json`](/Users/ynger/Downloads/n400-citizenflow-project/tools.json).

## Webhook target

If you enable webhooks, point ElevenLabs to:

`POST /api/elevenlabs/webhook`

Include a secret only if you also set `ELEVENLABS_WEBHOOK_SECRET` in the app.

## Knowledge base sources

The current agent is grounded in these local source files and matching uploaded ElevenLabs knowledge-base entries:

- [`N400_OFFICIAL_REQUIREMENTS.md`](/Users/ynger/Downloads/n400-citizenflow-project/docs/uscis/N400_OFFICIAL_REQUIREMENTS.md)
- [`N400_SUPPORTED_SCOPE.md`](/Users/ynger/Downloads/n400-citizenflow-project/docs/uscis/N400_SUPPORTED_SCOPE.md)
- [`N400_FIELD_GUIDE.md`](/Users/ynger/Downloads/n400-citizenflow-project/docs/uscis/N400_FIELD_GUIDE.md)
