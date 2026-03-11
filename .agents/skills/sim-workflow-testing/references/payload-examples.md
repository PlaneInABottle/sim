# Complete Payload Examples

Full neutral payload examples for Sim workflow testing. For the base template and
override rules, see [`payload-templates.md`](payload-templates.md).

---

## Example 1: Text Greeting

```json
{
  "event": "message_created",
  "id": 99001,
  "content": "Hello",
  "content_type": "text",
  "message_type": "incoming",
  "created_at": "2026-02-11T10:00:00.000Z",
  "private": false,
  "source_id": null,
  "content_attributes": {},
  "sender": {
    "id": 12345,
    "name": "Test Customer",
    "phone_number": "+15555550123",
    "email": null,
    "type": "contact"
  },
  "conversation": {
    "additional_attributes": {},
    "can_reply": true,
    "channel": "Channel::Api",
    "contact_inbox": {
      "id": 100,
      "source_id": "wa:15555550123"
    },
    "id": 42,
    "inbox_id": 1,
    "messages": [],
    "meta": {
      "sender": {
        "id": 12345,
        "name": "Test Customer",
        "phone_number": "+15555550123",
        "type": "contact"
      }
    },
    "status": "pending",
    "unread_count": 1
  },
  "account": {
    "id": 1,
    "name": "Test Workspace"
  },
  "attachments": []
}
```

## Example 2: Voice Message

```json
{
  "event": "message_created",
  "id": 99004,
  "content": "",
  "content_type": "text",
  "message_type": "incoming",
  "created_at": "2026-02-11T10:01:00.000Z",
  "private": false,
  "source_id": null,
  "content_attributes": {},
  "sender": {
    "id": 12345,
    "name": "Test Customer",
    "phone_number": "+15555550123",
    "email": null,
    "type": "contact"
  },
  "conversation": {
    "additional_attributes": {},
    "can_reply": true,
    "channel": "Channel::Api",
    "contact_inbox": {
      "id": 100,
      "source_id": "wa:15555550123"
    },
    "id": 42,
    "inbox_id": 1,
    "messages": [],
    "meta": {
      "sender": {
        "id": 12345,
        "name": "Test Customer",
        "phone_number": "+15555550123",
        "type": "contact"
      }
    },
    "status": "pending",
    "unread_count": 1
  },
  "account": {
    "id": 1,
    "name": "Test Workspace"
  },
  "attachments": [
    {
      "id": 501,
      "message_id": 99004,
      "file_type": "audio",
      "account_id": 1,
      "data_url": "https://chatwoot-assets.example.com/voice_message_001.ogg",
      "extension": "ogg",
      "thumb_url": null
    }
  ]
}
```

## Example 3: Outgoing Message

```json
{
  "event": "message_created",
  "id": 99007,
  "content": "Thanks for reaching out",
  "content_type": "text",
  "message_type": "outgoing",
  "created_at": "2026-02-11T10:03:00.000Z",
  "private": false,
  "source_id": null,
  "content_attributes": {},
  "sender": {
    "id": 99,
    "name": "Support Bot",
    "phone_number": null,
    "email": null,
    "type": "user"
  },
  "conversation": {
    "additional_attributes": {},
    "can_reply": true,
    "channel": "Channel::Api",
    "contact_inbox": {
      "id": 100,
      "source_id": "wa:15555550123"
    },
    "id": 42,
    "inbox_id": 1,
    "messages": [],
    "meta": {
      "sender": {
        "id": 12345,
        "name": "Test Customer",
        "phone_number": "+15555550123",
        "type": "contact"
      }
    },
    "status": "pending",
    "unread_count": 0
  },
  "account": {
    "id": 1,
    "name": "Test Workspace"
  },
  "attachments": []
}
```
