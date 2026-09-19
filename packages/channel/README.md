---
description: "Package map for instant-messaging channel connections that carry DSH Sessions to and from a phone."
kind: "package-group"
---

# channel/ — instant-messaging connections to DSH Sessions

English | [中文](README.zh.md)

## Summary

The Channel family connects a DSH Session to an instant-messaging platform so a user can drive an agent from a phone. The service definition owns the provider set and the inbound fan-out; each provider owns one platform connection and its protocol; a Consumer turns authenticated messages into ordinary Sessions and relays permission questions back.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`channel/`](channel/README.md) | Provider registry, branded identities, inbound provenance | `ctx.channels` |

<a id="related-documentation"></a>
## Related documentation

The [remote channel connections decision](../../docs/decisions/0001-remote-channel-connections.md) owns the durable contracts: the registry interface, conversation-binding durability, the admission extraction, outbound delivery, conversation commands, the permission-question relay, and per-package ownership.

The [channel subsystem](../../docs/subsystems/channel.md) is the reference for the registry's provider contract, its registration lifetime, and the values providers, the Consumer, and the Remote controller share.

<a id="dev-note"></a>
## Dev Note

None.
