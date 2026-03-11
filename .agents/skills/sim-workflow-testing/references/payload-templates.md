# Payload Templates

Base Chatwoot webhook payload templates and generic scenario overrides for Sim
workflow testing.

---

## Base Template

```json
{
  "event": "message_created",
  "id": {{MESSAGE_ID}},
  "content": "{{MESSAGE_CONTENT}}",
  "content_type": "{{CONTENT_TYPE}}",
  "message_type": "{{MESSAGE_TYPE}}",
  "created_at": "{{CREATED_AT}}",
  "private": false,
  "source_id": null,
  "content_attributes": {},
  "sender": {
    "id": {{SENDER_ID}},
    "name": "{{SENDER_NAME}}",
    "phone_number": "{{SENDER_PHONE}}",
    "email": null,
    "type": "contact"
  },
  "conversation": {
    "additional_attributes": {},
    "can_reply": true,
    "channel": "Channel::Api",
    "contact_inbox": {
      "id": {{CONTACT_INBOX_ID}},
      "source_id": "{{CONTACT_SOURCE_ID}}"
    },
    "id": {{CONVERSATION_ID}},
    "inbox_id": {{INBOX_ID}},
    "messages": [],
    "meta": {
      "sender": {
        "id": {{SENDER_ID}},
        "name": "{{SENDER_NAME}}",
        "phone_number": "{{SENDER_PHONE}}",
        "type": "contact"
      }
    },
    "status": "pending",
    "unread_count": 1
  },
  "account": {
    "id": {{ACCOUNT_ID}},
    "name": "{{ACCOUNT_NAME}}"
  },
  "attachments": []
}
```

## Default Values

| Variable | Default Value | Notes |
|----------|---------------|-------|
| `MESSAGE_ID` | `99001` | Unique per scenario |
| `MESSAGE_CONTENT` | `"Hello"` | Replace per scenario |
| `CONTENT_TYPE` | `"text"` | Standard Chatwoot message type |
| `MESSAGE_TYPE` | `"incoming"` | Customer-originated message |
| `CREATED_AT` | `"2026-02-11T10:00:00.000Z"` | ISO 8601 |
| `SENDER_ID` | `12345` | Test contact ID |
| `SENDER_NAME` | `"Test Customer"` | Neutral test identity |
| `SENDER_PHONE` | `"+15555550123"` | Test-safe E.164 number |
| `CONTACT_INBOX_ID` | `100` | Arbitrary |
| `CONTACT_SOURCE_ID` | `"wa:15555550123"` | Channel-specific source |
| `CONVERSATION_ID` | `42` | Test conversation |
| `INBOX_ID` | `1` | Test inbox |
| `ACCOUNT_ID` | `1` | Test account |
| `ACCOUNT_NAME` | `"Test Workspace"` | Neutral workspace label |

## Scenario Override Table

| Scenario | `message_type` | `content` | `attachments` | Purpose |
|----------|----------------|-----------|---------------|---------|
| Text greeting | `"incoming"` | `"Hello"` | `[]` | Basic text routing |
| Product question | `"incoming"` | `"Can you help with pricing?"` | `[]` | Text path with business intent |
| Order status | `"incoming"` | `"Where is my order?"` | `[]` | Text path with lookup intent |
| Voice message | `"incoming"` | `""` | `[voice_attachment]` | Media routing |
| Image message | `"incoming"` | `""` | `[image_attachment]` | Media routing |
| Outgoing message | `"outgoing"` | `"Thanks for reaching out"` | `[]` | Drop / ignore path |
| Team-assigned conversation | `"incoming"` | `"Hello"` | `[]` | Conversation-meta override case |

## Attachment Objects

Use these neutral attachment objects:

```json
{
  "voice_attachment": {
    "id": 501,
    "message_id": 99001,
    "file_type": "audio",
    "account_id": 1,
    "data_url": "https://chatwoot-assets.example.com/voice_message_001.ogg",
    "extension": "ogg",
    "thumb_url": null
  },
  "image_attachment": {
    "id": 502,
    "message_id": 99001,
    "file_type": "image",
    "account_id": 1,
    "data_url": "https://chatwoot-assets.example.com/photo_001.jpg",
    "extension": "jpg",
    "thumb_url": "https://chatwoot-assets.example.com/photo_001_thumb.jpg"
  },
  "video_attachment": {
    "id": 503,
    "message_id": 99001,
    "file_type": "video",
    "account_id": 1,
    "data_url": "https://chatwoot-assets.example.com/video_001.mp4",
    "extension": "mp4",
    "thumb_url": "https://chatwoot-assets.example.com/video_001_thumb.jpg"
  },
  "document_attachment": {
    "id": 504,
    "message_id": 99001,
    "file_type": "file",
    "account_id": 1,
    "data_url": "https://chatwoot-assets.example.com/document_001.pdf",
    "extension": "pdf",
    "thumb_url": null
  }
}
```

## Variable Notes

- Use neutral names and numbers unless the workflow under test requires a specific fixture.
- Keep `CONDITION_ONLY`, `PATH_ISOLATION`, and `FULL_INTEGRATION` as the shared profile names.
- For company-specific wording or IDs, move that material into a workflow-specific wrapper skill.
